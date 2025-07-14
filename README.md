
# CampusTalk Backend

A Node.js backend server for CampusTalk - an anonymous chat application for college students.

## Features

- **Real-time messaging** using Socket.IO
- **Queue management** for matching users
- **Room-based chat** system
- **Object-oriented design** with clean class structures
- **RESTful API** endpoints for statistics
- **Automatic cleanup** of disconnected users and empty rooms

## Architecture

### Classes

- **User**: Represents a connected user with socket management
- **Room**: Manages chat sessions between two users
- **QueueManager**: Handles user queue and matching logic
- **RoomManager**: Manages active chat rooms
- **ChatServer**: Main server class that orchestrates everything

### Data Structures

- **Map**: Used for storing users and rooms (O(1) lookup)
- **Array**: Used for queue management (FIFO)
- **Queue**: Waiting users are managed in a first-in-first-out basis

## Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# Start in development mode with auto-reload
npm run dev
```

## API Endpoints

### GET /api/stats
Returns server statistics:
```json
{
  "connectedUsers": 5,
  "queueLength": 1,
  "totalRooms": 2,
  "activeRooms": 2
}
```

### GET /api/health
Health check endpoint:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Socket.IO Events

### Client to Server

- **joinQueue**: Join the waiting queue for matching
- **sendMessage**: Send a message to chat partner
- **disconnectChat**: Manually disconnect from current chat
- **findNew**: Disconnect and find a new chat partner

### Server to Client

- **connected**: Notified when matched with another user
- **message**: Receive a message from chat partner
- **userDisconnected**: Notified when chat partner disconnects
- **disconnected**: Notified when you are disconnected

## Usage Example

```javascript
const { ChatServer } = require('./index.js');

// Create and start server
const server = new ChatServer();
server.start(3001);
```

## Environment Variables

- **PORT**: Server port (default: 3001)
- **NODE_ENV**: Environment mode (development/production)

## Testing

```bash
npm test
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure proper CORS origins
3. Use PM2 or similar for process management
4. Set up proper logging
5. Configure load balancing if needed

## Security Considerations

- Implement rate limiting for message sending
- Add user authentication for college verification
- Sanitize all user inputs
- Implement proper session management
- Add monitoring and logging

## Scaling

The server is designed to handle multiple concurrent users. For larger scales:

- Use Redis for session storage
- Implement horizontal scaling with multiple server instances
- Add database persistence for chat history (optional)
- Use message queues for better reliability
