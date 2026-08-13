const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomRoutes = require('./routes/roomRoutes');
const setupSocket = require('./socket/socketHandler');

const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', roomRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Initialize WebSockets
setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Spades Casino Engine running on port ${PORT}`));