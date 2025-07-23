# Randomize Backend

This document explains the architecture, flow, and implementation details of the backend for **Randomize**, a real-time anonymous chat and video platform. Built using **Node.js**, **Express**, and **Socket.IO**, it manages matchmaking, rooms, messaging, WebRTC signaling, and user queues.

---

## Overview

* **Language/Framework:** Node.js with Express
* **WebSockets:** Powered by Socket.IO
* **Modes Supported:** Text and Video
* **Room Model:** One-to-one anonymous sessions
* **Queue System:** FIFO with shuffling for randomness

---

## Dependencies

* `express` – HTTP server
* `http` – Native module to create server
* `socket.io` – WebSocket communication
* `cors` – Enable CORS
* `dotenv` – Environment variables loader

---

## Server Initialization

```js
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { ... } });
```

* CORS setup is done using frontend URL from `.env`
* Express handles JSON payloads

---

## Core Structures

### Queues:

* `textQueue[]`: Users waiting for text match
* `videoQueue[]`: Users waiting for video match

### Active Rooms:

* `activeRooms: Map<roomId, room>`
* Room: `{ id, mode, users[], createdAt }`

---

## Utility Functions

### `generateRoomId()`

Generates a unique alphanumeric room ID.

### `shuffleArray(array)`

Randomizes order of users in the queue to avoid deterministic pairing.

### `getUserFromQueue(socketId)`

Returns user object from either queue using socket ID.

### `getUserBySocketId(socketId)`

Finds a user inside activeRooms with room ID.

### `findMatch(queue, currentUser)`

* Removes user if already in queue
* Shuffles queue
* Finds match or re-adds the user

### `removeFromQueues(socketId)`

Removes user from both queues based on socket ID.

### `leaveRoom(socketId, requeue = true)`

* Notifies other user in the room
* Deletes room from activeRooms
* Requeues both users (optional)

### `proceedToFindNew(socket)`

Handles disconnect + rematch for users.

### `getRandomIceBreaker()`

Fetches and shuffles icebreakers from external module.

---

## Socket.IO Events

### Connection

```js
io.on("connection", (socket) => { ... })
```

Defines all client-server interactions.

### `join-queue`

Adds user to queue or matches them.

* Creates room if matched
* Emits `matched` event with icebreaker

### `send-message`

Relays message to the other peer in the same room.

### `typing`

Notifies peer about typing status.

### WebRTC Signaling Events:

* `call-offer`: Sends offer to peer
* `call-answer`: Sends answer to peer
* `ice-candidate`: Sends ICE candidate to peer

### Matching Events:

* `find-new`: Prompts peer
* `peer-confirm-find-new`: Finalizes disconnect and rematch

### `end-call`

Ends current room and requeues users.

### `disconnect`

* Removes from queues
* Leaves room
* Logs queues and users (non-commented parts)

---

## Stress Test Benchmark

A high-load simulation was conducted to evaluate backend stability and performance:

```
--- Benchmark Results ---
Total users simulated: 4000
Total Message per User: 50
Total time: 42.92s
Average match time: 246.48ms
Errors: 4
------------------------
```

**Key Highlights:**

* Successfully handled **4,000 concurrent users**
* Maintained **<250ms average matchmaking latency**
* Processed over **200,000 messages** in under 43 seconds
* Maintained a **99.9% success rate** with only 4 disconnects

---

## Environment Variables

* `FRONTEND_URL`: URL for CORS policy
* `PORT`: Server port (defaults to 3001)
