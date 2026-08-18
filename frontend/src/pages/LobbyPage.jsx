import React, { useState, useContext, useEffect } from 'react'; // <-- ADDED useEffect
import { socket } from '../socket/socketClient';
import { playSound } from '../utils/audio';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Spade, LogIn, Swords, LogOut ,Info, X} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LobbyPage({ availableRooms }) {
  const { user, logout } = useContext(AuthContext); 
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [targetScore, setTargetScore] = useState(26);
  const [showInfo, setShowInfo] = useState(false);

  // ==========================================
  // THE LOBBY REFRESH FIX
  // ==========================================
  useEffect(() => {
    // The moment this page loads on screen, demand the room list from the server
    socket.emit('GET_ROOMS');
  }, []);
  // ==========================================

  const handleCreateRoom = (e) => {
    if (e) e.preventDefault(); 
    
    console.log("🚨 BUTTON CLICKED!");
    console.log("Is Socket Connected to Backend?:", socket.connected); 

    if (!roomName || !roomPassword) return toast.error('Room name and password are required!');
    if (!user || !user.username) return toast.error('Authentication error. Please log in again.');

    playSound('click');
    socket.emit('CREATE_ROOM', { roomName, password: roomPassword, username: user.username,targetScore });
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
      <div className="flex items-center justify-center gap-4 mb-8">
        <span className="text-base-content/70">
          Welcome, <strong className="text-info">{user?.username || 'Player'}</strong>
        </span>
        <Link to="/profile" className="btn btn-info btn-sm btn-outline gap-2">
          Profile
        </Link>
        <button onClick={logout} className="btn btn-error btn-sm btn-outline gap-2">
          <LogOut size={16} /> Logout
        </button>
        {/* INFO BUTTON (Put this near your Header/Logo) */}
      <button 
        onClick={() => setShowInfo(true)}
        style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}
      >
        <Info size={20} /> How to Play
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
            {/* The new Target Score Input */}
            <div style={{ marginBottom: '16px', textAlign: 'left' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem' }}>Winning Score</label>
              <input
                type="number"
                min="1"
                max="100"
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: 'white' }}
              />
            </div>
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
      {showInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid #38bdf8', borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%', position: 'relative', textAlign: 'left', color: '#e2e8f0' }}>
            
            <button onClick={() => setShowInfo(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={24} />
            </button>
            
            <h2 style={{ color: '#38bdf8', margin: '0 0 16px 0' }}>How to Play: Mystic Icons Spades</h2>
            
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
              <h3 style={{ color: '#facc15', fontSize: '1.1rem', margin: '12px 0 4px 0' }}>The Objective</h3>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>Be the first player to reach the Target Score! You earn points by accurately predicting how many tricks (hands) you will win each round.</p>

              <h3 style={{ color: '#facc15', fontSize: '1.1rem', margin: '16px 0 4px 0' }}>Bidding</h3>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>At the start of the round, look at your 13 cards. Bid the exact number of tricks you think you can win. (1 trick = 1 point).</p>

              <h3 style={{ color: '#facc15', fontSize: '1.1rem', margin: '16px 0 4px 0' }}>Playing the Cards</h3>
              <ul style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0, paddingLeft: '20px' }}>
                <li>You <strong>must</strong> follow the suit led if you have it.</li>
                <li>If you don't have the led suit, you can play a Spade or any other suit.</li>
                <li>The highest card of the led suit wins, <strong>unless</strong> a Spade is played.</li>
                <li><strong>Spades are Trump:</strong> The highest Spade played always wins the trick.</li>
                <li>You cannot lead with a Spade until they have been "broken" (played in a previous trick).</li>
              </ul>

              <h3 style={{ color: '#facc15', fontSize: '1.1rem', margin: '16px 0 4px 0' }}>Scoring & The Luck System</h3>
              <ul style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0, paddingLeft: '20px' }}>
                <li><strong>Made your bid?</strong> You get 1 point per trick.</li>
                <li><strong>Missed your bid?</strong> You lose points equal to your bid!</li>
                <li><strong>Bags (Over-tricks):</strong> If you win <em>more</em> tricks than you bid, you get extra points, but your <strong>Luck Status</strong> decreases! Lower luck means you are dealt fewer guaranteed Spades in the next round.</li>
              </ul>
            </div>
            
            <button onClick={() => setShowInfo(false)} className="btn-primary" style={{ width: '100%', marginTop: '20px' }}>
              Got It!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}