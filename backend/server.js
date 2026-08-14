const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose'); // ADDED

const roomRoutes = require('./routes/roomRoutes');
const authRoutes = require('./routes/authRoutes'); // ADDED
const setupSocket = require('./socket/socketHandler');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// API Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/auth', authRoutes); // ADDED

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Spades Casino Engine running on port ${PORT}`));