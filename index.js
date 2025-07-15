const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const { getActiveResourcesInfo } = require("process");
dotenv.config("./.env");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

app.use(cors());
app.use(express.json());

const textQueue = [];
const videoQueue = [];
const activeRooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substr(2, 9);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getUserFromQueue(socketId) {
  const user = textQueue.find((user) => user.socketId === socketId);
  if (user) return user;
  return videoQueue.find((user) => user.socketId === socketId);
}

function getUserBySocketId(socketId) {
  for (const [roomId, room] of activeRooms.entries()) {
    const user = room.users.find((user) => user.socketId === socketId);
    if (user) {
      return { ...user, roomId }; // return roomId too!
    }
  }
  return null;
}

function findMatch(queue, currentUser) {
  const userIndex = queue.findIndex(
    (user) => user.socketId === currentUser.socketId
  );
  if (userIndex !== -1) {
    queue.splice(userIndex, 1);
  }

  shuffleArray(queue);

  if (queue.length > 0) {
    const match = queue.shift();
    return match;
  }

  queue.push(currentUser);
  return null;
}

function removeFromQueues(socketId) {

  const textIndex = textQueue.findIndex((user) => user.socketId === socketId);
  if (textIndex !== -1) {
    textQueue.splice(textIndex, 1);
    console.log(`removed ${socketId} from queue`);
  }

  const videoIndex = videoQueue.findIndex((user) => user.socketId === socketId);
  if (videoIndex !== -1) {
    videoQueue.splice(videoIndex, 1);
    console.log(`removed ${socketId} from video queue`);
  }
}

function leaveRoom(socketId, requeue = true) {
  for (const [roomId, room] of activeRooms.entries()) {
    if (room.users.some((user) => user.socketId === socketId)) {
      room.users.forEach((user) => {
        if (user.socketId !== socketId) {
          io.to(user.socketId).emit("user-disconnected");
          io.to(user.socketId).emit("peer-disconnected");
        }
      });

      const mode = room.mode;

      if (requeue) {
        room.users.forEach((user) => {
          if (mode === "text") {
            if (!textQueue.find((u) => u.socketId === user.socketId)) {
              textQueue.push(user);
            }
          } else {
            if (!videoQueue.find((u) => u.socketId === user.socketId)) {
              videoQueue.push(user);
            }
          }
        });
      }

      activeRooms.delete(roomId);
      break;
    }
  }
}

function proceedToFindNew(socket) {
  const user = getUserBySocketId(socket.id);
  if (!user) return;

  leaveRoom(socket.id);
  const queue = user.mode === "text" ? textQueue : videoQueue;
  const match = findMatch(queue, user);

  if (match) {
    const roomId = generateRoomId();
    const room = { id: roomId, mode: user.mode, users: [user, match], createdAt: new Date() };
    activeRooms.set(roomId, room);

    io.to(user.socketId).emit("matched", {
      roomId,
      otherUser: { id: match.id, name: match.name },
    });
    io.to(match.socketId).emit("matched", {
      roomId,
      otherUser: { id: user.id, name: user.name },
    });
  }
}

io.on("connection", (socket) => {
  socket.on("join-queue", (data) => {
    const { userId, userName, mode } = data;

    const user = {
      id: userId,
      name: userName,
      socketId: socket.id,
      mode: mode,
    };

    removeFromQueues(socket.id);

    const queue = mode === "text" ? textQueue : videoQueue;
    const match = findMatch(queue, user);

    if (match) {
      const roomId = generateRoomId();
      const room = {
        id: roomId,
        mode: mode,
        users: [user, match],
        createdAt: new Date(),
      };

      activeRooms.set(roomId, room);
      socket.emit("matched", {
        roomId,
        otherUser: { id: match.id, name: match.name },
      });

      io.to(match.socketId).emit("matched", {
        roomId,
        otherUser: { id: user.id, name: user.name },
      });
    } else {
      console.log(` User ${userName} added to ${mode} queue`);
    }
  });

  socket.on("send-message", (data) => {
    for (const [roomId, room] of activeRooms.entries()) {
      const userInRoom = room.users.find((user) => user.socketId === socket.id);
      if (userInRoom) {
        room.users.forEach((user) => {
          if (user.socketId !== socket.id) {
            io.to(user.socketId).emit("message", {
              text: data.text,
              from: userInRoom.name,
            });
          }
        });
        break;
      }
    }
  });

  socket.on("typing", () => {
    for (const [roomId, room] of activeRooms.entries()) {
      const userInRoom = room.users.find((user) => user.socketId === socket.id);
      if (userInRoom) {
        room.users.forEach((user) => {
          if (user.socketId !== socket.id) {
            io.to(user.socketId).emit("typing");
          }
        });
        break;
      }
    }
  });

  socket.on("call-offer", (data) => {
    for (const [roomId, room] of activeRooms.entries()) {
      const userInRoom = room.users.find((user) => user.socketId === socket.id);
      if (userInRoom && room.mode === "video") {
        room.users.forEach((user) => {
          if (user.socketId !== socket.id) {
            io.to(user.socketId).emit("call-offer", {
              from: socket.id,
              offer: data.offer,
            });
          }
        });
        break;
      }
    }
  });

  socket.on("call-answer", (data) => {
    for (const [roomId, room] of activeRooms.entries()) {
      const userInRoom = room.users.find((user) => user.socketId === socket.id);
      if (userInRoom && room.mode === "video") {
        room.users.forEach((user) => {
          if (user.socketId !== socket.id) {
            io.to(user.socketId).emit("call-answer", {
              from: socket.id,
              answer: data.answer,
            });
          }
        });
        break;
      }
    }
  });

  socket.on("ice-candidate", (data) => {
    for (const [roomId, room] of activeRooms.entries()) {
      const userInRoom = room.users.find((user) => user.socketId === socket.id);
      if (userInRoom) {
        room.users.forEach((user) => {
          if (user.socketId !== socket.id) {
            io.to(user.socketId).emit("ice-candidate", {
              from: socket.id,
              candidate: data.candidate,
            });
          }
        });
        break;
      }
    }
  });

  socket.on("peer-confirm-find-new", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
  
    const otherUser = activeRooms.get(user.roomId)?.users.find((u) => u.socketId !== socket.id);
  
    // Disconnect both
    leaveRoom(socket.id);
    if (otherUser) leaveRoom(otherUser.socketId);
  
    // Proceed to re-match both
    proceedToFindNew(socket);
    if (otherUser) proceedToFindNew({ id: otherUser.socketId });
  });

  socket.on("find-new", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) {
      const queuedUser = getUserFromQueue(socket.id);
      if (!queuedUser) return;
  
      const queue = queuedUser.mode === "text" ? textQueue : videoQueue;
      const match = findMatch(queue, queuedUser);
  
      if (match) {
        const roomId = generateRoomId();
        const room = { id: roomId, mode: queuedUser.mode, users: [queuedUser, match], createdAt: new Date() };
        activeRooms.set(roomId, room);
  
        io.to(queuedUser.socketId).emit("matched", {
          roomId,
          otherUser: { id: match.id, name: match.name },
        });
        io.to(match.socketId).emit("matched", {
          roomId,
          otherUser: { id: queuedUser.id, name: queuedUser.name },
        });
      }
      return;
    }
  
    // Send prompt to the peer ONLY, no leave yet!
    const otherUser = activeRooms.get(user.roomId)?.users.find((u) => u.socketId !== socket.id);
    if (otherUser) {
      io.to(otherUser.socketId).emit("peer-wants-find-new");
    }
  });

  

  socket.on("end-call", () => {
    for (const [roomId, room] of activeRooms.entries()) {
      const userInRoom = room.users.find((user) => user.socketId === socket.id);
      if (userInRoom) {
        room.users.forEach((user) => {
          if (user.socketId !== socket.id) {
            io.to(user.socketId).emit("call-ended");
          }
        });
        break;
      }
    }

    leaveRoom(socket.id);
  });

  socket.on("disconnect", () => {
    console.log("yo nikal rha bahar ------------------");
    console.log(
      "Text Queue:",
      textQueue.map((user) => user.name)
    );
    leaveRoom(socket.id, true);
    removeFromQueues(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready for connections`);
});

// setInterval(() => {
//   //console the state of active rooms and queues
//   console.log("Active Rooms:", Array.from(activeRooms.keys()));
//   console.table(
//     Array.from(activeRooms.values()).map((room) => ({
//       id: room.id,
//       mode: room.mode,
//       users: room.users.map((user) => user.name).join(", "),
//       createdAt: room.createdAt.toLocaleString(),
//     }))
//   );
//   console.log(
//     "Text Queue:",
//     textQueue.map((user) => user.name)
//   );
//   console.log(
//     "Video Queue:",
//     videoQueue.map((user) => user.name)
//   );
//   console.log("Total Active Rooms:", activeRooms.size);
//   console.log("Total Text Queue Users:", textQueue.length);
//   console.log("Total Video Queue Users:", videoQueue.length);
//   console.log("--------------------------------------------------");
// }, 10000);
