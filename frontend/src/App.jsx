import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { Spade, User, Trophy, LogIn, Crown, Play, Swords } from 'lucide-react';
import './App.css';

// --- AUDIO SYNTHESIZER UTILITY ---
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } else if (type === 'play') {
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (e) {}
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
const socket = io(SOCKET_URL);

const checkPlayable = (hand, cardToPlay, trick) => {
  if (trick.length === 0) return true;
  const leadSuit = trick[0].card.suit;
  const leadSuitCards = trick.filter(t => t.card.suit === leadSuit);
  const highestLeadRank = Math.max(...leadSuitCards.map(t => t.card.rank));
  const isTrumped = leadSuit !== 'spades' && trick.some(t => t.card.suit === 'spades');
  const handHasLead = hand.some(c => c.suit === leadSuit);
  const handCanBeatLead = hand.some(c => c.suit === leadSuit && c.rank > highestLeadRank);
  const handHasSpades = hand.some(c => c.suit === 'spades');

  if (!isTrumped && handCanBeatLead) return cardToPlay.suit === leadSuit && cardToPlay.rank > highestLeadRank;
  if (handHasLead) return cardToPlay.suit === leadSuit;
  if (handHasSpades) return cardToPlay.suit === 'spades';
  return true;
};

// --- HELPER COMPONENT: Playing Card ---
const PlayingCard = ({ card, faceDown, onClick, isPlayable, isDimmed }) => {
  if (faceDown || card.suit === 'hidden') {
    return (
      <div className="card face-down">
        <div className="card-pattern"></div>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  
  let displayRank = card.rank;
  if (card.rank === 11) displayRank = 'J';
  if (card.rank === 12) displayRank = 'Q';
  if (card.rank === 13) displayRank = 'K';
  if (card.rank === 14) displayRank = 'A';

  return (
    <div 
      className={`card ${isRed ? 'red-suit' : 'black-suit'} ${isPlayable ? 'playable' : ''} ${isDimmed ? 'dimmed-card' : ''}`} 
      onClick={isPlayable ? onClick : undefined}
    >
      <div className="card-top">{displayRank} {suits[card.suit]}</div>
      <div className="card-center">{suits[card.suit]}</div>
      <div className="card-bottom">{displayRank} {suits[card.suit]}</div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [view, setView] = useState('lobby'); 
  const [availableRooms, setAvailableRooms] = useState([]);
  const [gameState, setGameState] = useState(null);
  
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  
  const [roomId, setRoomId] = useState(null);
  const [playingAs, setPlayingAs] = useState(null); 
  const [bidInput, setBidInput] = useState('');

  useEffect(() => {
    socket.on('ROOM_LIST', (rooms) => setAvailableRooms(rooms));
    
    socket.on('ROOM_JOINED', ({ roomId, seatIndex }) => {
      setRoomId(roomId);
      setPlayingAs(seatIndex);
      setView('game');
      playSound('click');
      toast.success('Joined Table successfully!');
    });

    socket.on('ROOM_ERROR', (msg) => {
      toast.error(msg);
    });

    socket.on('STATE_UPDATE', (state) => {
      setGameState(state);
      if (state.phase === 'bidding') setBidInput('');
    });

    socket.on('INVALID_PLAY', (msg) => {
      toast.error(msg);
    });

    return () => {
      socket.off('ROOM_LIST'); socket.off('ROOM_JOINED'); socket.off('ROOM_ERROR');
      socket.off('STATE_UPDATE'); socket.off('INVALID_PLAY');
    };
  }, []);

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

  if (view === 'lobby') {
    return (
      <div className="theme-wrapper dark-theme">
        <Toaster position="top-center" />
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
                <button type="submit" className="btn-primary" style={{width: '100%'}} onClick={() => playSound('click')}>Create Room</button>
              </form>
            </div>

            <div className="lobby-panel">
              <h2><LogIn size={20}/> Or Join a Table</h2>
              <div className="room-list">
                {availableRooms.length === 0 && <p style={{color: '#94a3b8'}}>No tables active right now.</p>}
                {availableRooms.map(r => (
                  <div key={r.id} className="room-card">
                    <div>
                      <strong>{r.name}</strong>
                      <span className="room-count"> ({r.playersCount}/4 Players)</span>
                    </div>
                    <button className="btn-secondary" onClick={() => handleJoinRoom(r.id)}>Join</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- GAME VIEW ---
  if (!gameState) return <div className="loading">Entering Table...</div>;

  const { players, phase, currentTurnIndex, currentTrick, spadesBroken, round, history } = gameState;
  const isMyTurn = phase !== 'waiting' && playingAs === currentTurnIndex;

  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (bidInput === '' || isNaN(bidInput)) return;
    playSound('click');
    socket.emit('SUBMIT_BID', { roomId, index: currentTurnIndex, bid: parseInt(bidInput, 10) });
  };

  const handlePlayCard = (cardId) => {
    if (!isMyTurn || phase !== 'playing' || currentTrick.length >= 4) return;
    playSound('play');
    socket.emit('PLAY_CARD', { roomId, playerIndex: playingAs, cardId });
  };

  // PLACED CORRECTLY INSIDE APP COMPONENT
  const getRelativePosition = (playerIndex) => {
    const seat = playingAs === 'ALL' ? 0 : playingAs;
    const diff = (playerIndex - seat + 4) % 4;
    if (diff === 0) return 'pos-bottom-trick';
    if (diff === 1) return 'pos-left-trick';
    if (diff === 2) return 'pos-top-trick';
    if (diff === 3) return 'pos-right-trick';
  };

  return (
    <div className="theme-wrapper dark-theme">
      <Toaster position="top-center" />
      <div className="app-container">
        
        {/* HEADER */}
        <header>
          <div>
            <h1><Spade size={24} className="inline-icon" /> Spades Engine</h1>
            <div className="profile-selector" style={{background: 'transparent', border: 'none', padding: 0}}>
              <User size={16} color="#94a3b8" />
              <label style={{color: '#94a3b8', marginLeft: '4px'}}>Playing As: </label>
              <strong style={{color: '#38bdf8', fontSize: '1.2rem', marginLeft: '8px'}}>{players[playingAs]?.name || 'Spectator'}</strong>
            </div>
          </div>
          <div className="header-right">
            <p className="round-badge">Round {round}</p>
            <div className="spades-status">
              Spades Broken: {spadesBroken ? '🔴 Yes' : '⚪ No'}
            </div>
          </div>
        </header>

        {/* VIRTUAL TABLE */}
        <div className="game-table">
          {phase === 'waiting' && (
            <div className="center-action animate-pop">
              <h2>Waiting for Players ({players.filter(p => p.socketId).length}/4)</h2>
              <p style={{marginBottom: '16px', color: '#a2a8d3'}}>First to 26 wins. 1 trick = 1 point.</p>
              {playingAs === 0 && (
                <button className="btn-primary flex-center" onClick={() => { playSound('click'); socket.emit('START_GAME', roomId); }}>
                  <Play size={18} style={{marginRight: '8px'}} /> Deal Cards
                </button>
              )}
            </div>
          )}

          {phase !== 'waiting' && phase !== 'game_over' && (
            <div className="game-table-grid">
              
              {/* TOP OPPONENT */}
              {(() => {
                const topP = playingAs === 'ALL' ? players[2] : players[(playingAs + 2) % 4];
                if (!topP) return null;
                return (
                  <div className={`opponent-card pos-top ${currentTurnIndex === topP.id ? 'active-turn' : ''} ${!topP.socketId ? 'dimmed-card' : ''}`}>
                    <h3>{topP.name}</h3>
                    <div className="stats-row">
                      <span>Score: {topP.score}</span> | <span>Bid: {topP.bid !== null ? topP.bid : '?'}</span> | <span>Won: {topP.tricksWon}</span>
                    </div>
                    <div className="opponent-hand stacked-cards">
                      {topP.hand?.map((_, idx) => <PlayingCard key={idx} faceDown={true} />)}
                    </div>
                  </div>
                );
              })()}

              {/* LEFT OPPONENT */}
              {(() => {
                const leftP = playingAs === 'ALL' ? players[1] : players[(playingAs + 1) % 4];
                if (!leftP) return null;
                return (
                  <div className={`opponent-card pos-left ${currentTurnIndex === leftP.id ? 'active-turn' : ''} ${!leftP.socketId ? 'dimmed-card' : ''}`}>
                    <h3>{leftP.name}</h3>
                    <div className="stats-col">
                      <span>Scr: {leftP.score}</span>
                      <span>Bid: {leftP.bid !== null ? leftP.bid : '?'}</span>
                      <span>Won: {leftP.tricksWon}</span>
                    </div>
                    <div className="opponent-hand vertical-stack">
                      {leftP.hand?.map((_, idx) => <PlayingCard key={idx} faceDown={true} />)}
                    </div>
                  </div>
                );
              })()}

              {/* CENTER TRICK (PLUS SHAPE) */}
              <div className="trick-area pos-center plus-layout">
                {currentTrick?.length === 0 && phase === 'playing' && (
                  <div className="trick-placeholder">Waiting for {players[currentTurnIndex].name} to lead...</div>
                )}
                {currentTrick?.map((play, idx) => (
                  <div 
                    key={idx} 
                    className={`absolute-trick ${getRelativePosition(play.playerIndex)}`}
                    style={{ zIndex: idx + 1 }} 
                  >
                    <div className="trick-card-animated">
                      <small className="trick-name-label">{players[play.playerIndex].name}</small>
                      <PlayingCard card={play.card} faceDown={false} />
                    </div>
                  </div>
                ))}
              </div>

              {/* RIGHT OPPONENT */}
              {(() => {
                const rightP = playingAs === 'ALL' ? players[3] : players[(playingAs + 3) % 4];
                if (!rightP) return null;
                return (
                  <div className={`opponent-card pos-right ${currentTurnIndex === rightP.id ? 'active-turn' : ''} ${!rightP.socketId ? 'dimmed-card' : ''}`}>
                    <h3>{rightP.name}</h3>
                    <div className="stats-col">
                      <span>Scr: {rightP.score}</span>
                      <span>Bid: {rightP.bid !== null ? rightP.bid : '?'}</span>
                      <span>Won: {rightP.tricksWon}</span>
                    </div>
                    <div className="opponent-hand vertical-stack">
                      {rightP.hand?.map((_, idx) => <PlayingCard key={idx} faceDown={true} />)}
                    </div>
                  </div>
                );
              })()}

              {/* BOTTOM: MY AREA */}
              <div className={`my-area pos-bottom ${isMyTurn ? 'my-turn-active' : ''}`}>
                <div className="my-stats">
                  <h2>{players[playingAs]?.name || 'Spectator'} (You)</h2>
                  <div className="my-scores">
                    <span>Total Score: <strong>{players[playingAs]?.score || 0}</strong></span>
                    <span className="divider">|</span>
                    <span>Bid: <strong>{players[playingAs]?.bid !== null && players[playingAs]?.bid !== undefined ? players[playingAs].bid : '-'}</strong></span>
                    <span className="divider">|</span>
                    <span>Won: <strong>{players[playingAs]?.tricksWon || 0}</strong></span>
                  </div>
                </div>
                
                {phase === 'bidding' && isMyTurn && (
                  <form onSubmit={handleBidSubmit} className="action-form animate-pop">
                    <label style={{color: "white"}}>Enter your bid:</label>
                    <input type="number" min="0" max="13" value={bidInput} onChange={(e) => setBidInput(e.target.value)} autoFocus />
                    <button type="submit" className="btn-primary" onClick={() => playSound('click')}>Submit</button>
                  </form>
                )}

                <div className="my-hand stacked-cards my-stacked-cards">
                  {players[playingAs]?.hand?.map(card => {
                    const amIPlaying = phase === 'playing' && isMyTurn;
                    const canPlayCard = amIPlaying ? checkPlayable(players[playingAs].hand, card, currentTrick) : false;
                    const isDimmed = phase === 'playing' && (!isMyTurn || !canPlayCard);
                    return (
                      <PlayingCard 
                        key={card.id} card={card} faceDown={false} 
                        isPlayable={canPlayCard} isDimmed={isDimmed}
                        onClick={() => handlePlayCard(card.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* OVERLAYS (Scoring & Game Over) */}
          {phase === 'scoring' && (
            <div className="center-action animate-pop">
              <h2>Round {round} Over!</h2>
              {gameState.overtimeActive && <p style={{color: '#f1c40f', fontWeight: 'bold', margin: '12px 0'}}>⚠️ Tie-Breaker Active! (Overtime {gameState.overtimeRound}/3)</p>}
              <p style={{marginBottom: '16px'}}>Scores have been calculated.</p>
              {playingAs === 0 && (
                <button className="btn-primary flex-center" onClick={() => { playSound('click'); socket.emit('NEXT_ROUND', roomId); }}>
                  <Play size={18} style={{marginRight: '8px'}} /> Deal Round {round + 1}
                </button>
              )}
            </div>
          )}

          {phase === 'game_over' && (
            <div className="center-action animate-pop">
              <h1 style={{color: '#f1c40f', fontSize: '2.5rem', margin: '0 0 16px 0'}}>Game Over!</h1>
              <div style={{background: 'rgba(0,0,0,0.6)', padding: '20px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left', border: '1px solid #f1c40f'}}>
                {[...players].sort((a, b) => b.score - a.score).map((p, index) => (
                  <div key={p.id} style={{fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: index === 0 ? '#4ade80' : 'white'}}>
                    {index === 0 ? <Crown size={24} color="#facc15" /> : null} 
                    {p.name}: <strong>{p.score} pts</strong>
                  </div>
                ))}
              </div>
              {playingAs === 0 && <button className="btn-primary" onClick={() => { playSound('click'); socket.emit('START_GAME', roomId); }}>Play Again</button>}
            </div>
          )}
        </div>

        {/* SCOREBOARD TABLE */}
        {history?.length > 0 && (
          <div className="table-container animate-pop">
            <div className="table-header-row">
              <h2><Trophy size={20} className="inline-icon" /> Round History</h2>
            </div>
            <div className="table-scroll-wrapper">
              <table className="score-table">
                <thead>
                  <tr>
                    <th className="rnd-col">Rnd</th>
                    {players.map(p => <th key={p.id}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.round}>
                      <td className="rnd-col"><strong>R{row.round}</strong></td>
                      {row.playerResults.map((res, i) => (
                        <td key={i} className={`score-cell ${res.change > 0 ? 'cell-success' : 'cell-fail'}`}>
                          <div className="score-change">{res.change > 0 ? `+${res.change}` : res.change}</div>
                          <small className="score-details">Bid: {res.bid} | Won: {res.won}</small>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}