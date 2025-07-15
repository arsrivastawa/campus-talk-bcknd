const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
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

function getUserBySocketId(socketId) {
  for (const [roomId, room] of activeRooms.entries()) {
    const user = room.users.find((user) => user.socketId === socketId);
    if (user) {
      return user;
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

function leaveRoom(socketId) {
  for (const [roomId, room] of activeRooms.entries()) {
    if (room.users.some((user) => user.socketId === socketId)) {
      room.users.forEach((user) => {
        if (user.socketId !== socketId) {
          io.to(user.socketId).emit("user-disconnected");
          io.to(user.socketId).emit("peer-disconnected");
        }
      });

      let mode = room.mode;
      if (mode === "text") {
        const userIndex = textQueue.findIndex(
          (user) => user.socketId === socketId
        );
        if (userIndex === -1) {
          textQueue.push(room.users.find((user) => user.socketId === socketId));
        }
      } else if (mode === "video") {
        const userIndex = videoQueue.findIndex(
          (user) => user.socketId === socketId
        );
        if (userIndex === -1) {
          videoQueue.push(
            room.users.find((user) => user.socketId === socketId)
          );
        }
      }
      activeRooms.delete(roomId);
      // shuffleArray(mode === "text" ? textQueue : videoQueue);
      break;
    }
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

  socket.on("find-new", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const queue = user.mode === "text" ? textQueue : videoQueue;
    leaveRoom(socket.id);
    findMatch(queue, user);
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
    removeFromQueues(socket.id);

    leaveRoom(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready for connections`);
});
