import { io } from 'socket.io-client';
// 1. Check if Vite is running in Development mode (npm run dev)
const isDev = import.meta.env.DEV;

// 2. If coding locally, force it to port 3000. If built for production, let it default to the host URL!
const SERVER_URL = isDev ? 'http://localhost:3000' : undefined;

export const socket = io(SERVER_URL);