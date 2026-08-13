import React, { useState } from 'react';
import { socket } from '../socket/socketClient';
import { playSound } from '../utils/audio';
import toast from 'react-hot-toast';
import { Spade, User, LogIn, Swords } from 'lucide-react';

export default function LobbyPage({ availableRooms }) {
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!username || !roomName || !roomPassword) return toast.error('All fields required');
    playSound('click');
    socket.emit('CREATE_ROOM', { roomName, password: roomPassword, username });
  };

  const handleJoinRoom = (targetRoomId) => {
    if (!username) return toast.error('Please set a username first!');
    const attemptPwd = prompt('Enter Room Password:');
    if (attemptPwd) {
      playSound('click');
      socket.emit('JOIN_ROOM', { roomId: targetRoomId, password: attemptPwd, username });
    }
  };

  return (
    <div className="lobby-container animate-pop">
      <h1><Spade className="inline-icon" size={32} /> Spades Casino</h1>
      <div className="lobby-panel">
        <h2><User size={20}/> 1. Choose your name</h2>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="lobby-input" />
      </div>
      <div className="lobby-grid">
        <div className="lobby-panel">
          <h2><Swords size={20}/> 2. Create a Table</h2>
          <form onSubmit={handleCreateRoom} className="create-form">
            <input type="text" placeholder="Room Name" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="lobby-input" />
            <input type="password" placeholder="Password" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} className="lobby-input" />
            <button type="submit" className="btn-primary" style={{width: '100%'}}>Create Room</button>
          </form>
        </div>
        <div className="lobby-panel">
          <h2><LogIn size={20}/> Or Join a Table</h2>
          <div className="room-list">
            {availableRooms.length === 0 && <p style={{color: '#94a3b8'}}>No tables active right now.</p>}
            {availableRooms.map(r => (
              <div key={r.id} className="room-card">
                <div><strong>{r.name}</strong><span className="room-count"> ({r.playersCount}/4 Players)</span></div>
                <button className="btn-secondary" onClick={() => handleJoinRoom(r.id)}>Join</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}