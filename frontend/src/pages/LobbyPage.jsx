import React, { useState, useContext } from 'react';
import { socket } from '../socket/socketClient';
import { playSound } from '../utils/audio';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Spade, LogIn, Swords, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LobbyPage({ availableRooms }) {
  const { user, logout } = useContext(AuthContext); 
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');

 const handleCreateRoom = (e) => {
    if (e) e.preventDefault(); 
    
    // THIS IS THE MOST IMPORTANT CHECK:
    console.log("🚨 BUTTON CLICKED!");
    console.log("Is Socket Connected to Backend?:", socket.connected); 

    if (!roomName || !roomPassword) return toast.error('Room name and password are required!');
    if (!user || !user.username) return toast.error('Authentication error. Please log in again.');

    playSound('click');
    socket.emit('CREATE_ROOM', { roomName, password: roomPassword, username: user.username });
  };

  const handleJoinRoom = (targetRoomId) => {
    const attemptPwd = prompt('Enter Room Password:');
    if (attemptPwd) {
      playSound('click');
      socket.emit('JOIN_ROOM', { 
        roomId: targetRoomId, 
        password: attemptPwd, 
        username: user?.username || 'Guest'
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto mt-10 p-4 text-center animate-pop">
      
      {/* HEADER WITH LOGOUT */}
      <div className="flex items-center gap-4">
  <span className="text-base-content/70">
    Welcome, <strong className="text-info">{user?.username || 'Player'}</strong>
  </span>
  <Link to="/profile" className="btn btn-info btn-sm btn-outline gap-2">
    Profile
  </Link>
  <button onClick={logout} className="btn btn-error btn-sm btn-outline gap-2">
    <LogOut size={16} /> Logout
  </button>
</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* CREATE ROOM PANEL */}
        <div className="bg-base-200 p-6 rounded-2xl shadow-xl border border-base-content/5 text-left">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-base-content">
            <Swords size={20} className="text-primary"/> Create a Table
          </h2>
          
          <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Room Name" 
              value={roomName} 
              onChange={(e) => setRoomName(e.target.value)} 
              className="input input-bordered input-primary w-full bg-base-100" 
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={roomPassword} 
              onChange={(e) => setRoomPassword(e.target.value)} 
              className="input input-bordered input-primary w-full bg-base-100" 
            />
            <button type="submit" className="btn btn-primary w-full shadow-lg shadow-primary/30">
              Create Room
            </button>
          </form>
        </div>

        {/* JOIN ROOM PANEL */}
        <div className="bg-base-200 p-6 rounded-2xl shadow-xl border border-base-content/5 text-left flex flex-col">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-base-content">
            <LogIn size={20} className="text-secondary"/> Join a Table
          </h2>
          
          <div className="flex-grow overflow-y-auto max-h-60 flex flex-col gap-3 pr-2">
            {availableRooms.length === 0 && (
              <p className="text-base-content/50 italic text-center mt-4">No tables active right now.</p>
            )}
            {availableRooms.map(r => (
              <div key={r.id} className="flex justify-between items-center bg-base-100 p-3 rounded-lg border border-base-content/10 shadow-sm">
                <div>
                  <strong className="text-base-content">{r.name}</strong>
                  <span className="text-sm text-base-content/60 ml-2">({r.playersCount}/4 Players)</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => handleJoinRoom(r.id)}>
                  Join
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}