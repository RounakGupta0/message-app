require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Group = require('./models/Group');

const app = express();
const PORT = process.env.PORT || 4500;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Create HTTP server wrapping Express app
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  pingInterval: 25000,
  pingTimeout: 20000,
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173", 'https://message-app-frontend-moom.onrender.com'],
    methods: ["GET", "POST"]
  }
});

// Socket.io JWT handshake authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error. Token not provided.'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    return next(new Error('Authentication error. Invalid token.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  socket.join(userId);
  console.log(`User connected: ${userId} (Socket ID: ${socket.id}) joined room`);

  // Relay typing status to recipient in real-time
  socket.on('typing', (data) => {
    io.to(data.recipientId).emit('typing', {
      senderId: userId,
      senderName: data.senderName
    });
  });

  // Relay stop typing status to recipient in real-time
  socket.on('stop_typing', (data) => {
    io.to(data.recipientId).emit('stop_typing', {
      senderId: userId
    });
  });

  // Relay group typing status to group members in real-time
  socket.on('group_typing', async (data) => {
    try {
      const group = await Group.findById(data.groupId);
      if (!group) return;
      group.members.forEach((memberId) => {
        const idStr = memberId.toString();
        if (idStr !== userId) {
          io.to(idStr).emit('group_typing', {
            groupId: data.groupId,
            senderId: userId,
            senderName: data.senderName
          });
        }
      });
    } catch (err) {
      console.error('Group typing event error:', err);
    }
  });

  // Relay group stop typing status to group members in real-time
  socket.on('group_stop_typing', async (data) => {
    try {
      const group = await Group.findById(data.groupId);
      if (!group) return;
      group.members.forEach((memberId) => {
        const idStr = memberId.toString();
        if (idStr !== userId) {
          io.to(idStr).emit('group_stop_typing', {
            groupId: data.groupId,
            senderId: userId
          });
        }
      });
    } catch (err) {
      console.error('Group stop typing event error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId} (Socket ID: ${socket.id})`);
  });
});

// Expose io to router contexts
app.set('io', io);

// Enable CORS middleware
app.use(cors());

// Enable JSON body parsing
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Message App Backend API is running on port 4500' });
});

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');

    // Start the HTTP/Socket server
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });
