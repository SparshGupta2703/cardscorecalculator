import { io } from 'socket.io-client';

// Notice we do NOT include '/api' here! It must be just the base port.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true
});