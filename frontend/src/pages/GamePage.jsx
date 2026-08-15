import React, { useState, useContext, useEffect } from 'react'; 
import { useNavigate, useParams } from 'react-router-dom'; 

import { socket } from '../socket/socketClient';
import { playSound } from '../utils/audio';
import { checkPlayable } from '../utils/gameRules';
import VoiceChat from '../components/VoiceChat';
import { AuthContext } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';
import DJBooth from '../components/DJBooth'; 
import toast from 'react-hot-toast';
import { Spade, User, Trophy, Crown, Play, Image as ImageIcon, LogOut } from 'lucide-react';

export default function GamePage({ gameState, roomId, playingAs }) {
  const { user, logout } = useContext(AuthContext);
  const [bidInput, setBidInput] = useState('');
  const [useCustomFaces, setUseCustomFaces] = useState(false);
  
  const navigate = useNavigate();
  const { id: urlRoomId } = useParams(); 

  // ==========================================
  // THE AUTO-REJOIN LOGIC
  // ==========================================
  useEffect(() => {
    if (!gameState && urlRoomId) {
      // 1. Grab the saved ticket from the browser
      const savedSessionId = sessionStorage.getItem(`spades_session_${urlRoomId}`);
      
      if (savedSessionId) {
        // 2. We have a ticket! Ask the server to let us back in.
        socket.emit('REJOIN_ROOM', { roomId: urlRoomId, sessionId: savedSessionId });
      } else {
        // 3. No ticket found, kick them back to the lobby
        toast.error("Session lost. Please rejoin from the lobby.");
        navigate('/');
      }
    }
  }, [gameState, urlRoomId, navigate]);

  // Handle cases where the 5-second grace period expired before they rejoined
  useEffect(() => {
    const handleRejoinFailed = (msg) => {
      toast.error(msg || "Failed to rejoin room.");
      sessionStorage.removeItem(`spades_session_${urlRoomId}`);
      navigate('/');
    };
    
    socket.on('REJOIN_FAILED', handleRejoinFailed);
    return () => socket.off('REJOIN_FAILED', handleRejoinFailed);
  }, [urlRoomId, navigate]);
  // ==========================================

  const handleLeaveTable = () => {
    playSound('click');
    // Destroy the saved ticket so it doesn't get stuck!
    sessionStorage.removeItem(`spades_session_${roomId || urlRoomId}`);
    socket.emit('LEAVE_ROOM', { roomId: roomId || urlRoomId });
    navigate('/');
  };

  if (!gameState) return <div className="loading">Entering Table...</div>;
  
  const { players, phase, currentTurnIndex, currentTrick, spadesBroken, round, history, roomPassword, customFaceMap, musicState } = gameState;
  
  const isMyTurn = phase !== 'waiting' && playingAs === currentTurnIndex;

  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (bidInput === '' || isNaN(bidInput)) return;
    playSound('click');
    socket.emit('SUBMIT_BID', { roomId, index: currentTurnIndex, bid: parseInt(bidInput, 10) });
    setBidInput('');
  };

  const handlePlayCard = (cardId) => {
    if (!isMyTurn || phase !== 'playing' || currentTrick.length >= 4) return;
    playSound('play');
    socket.emit('PLAY_CARD', { roomId, playerIndex: playingAs, cardId });
  };

  const handleToggleFaces = (e) => {
    const isChecked = e.target.checked;
    setUseCustomFaces(isChecked);
    
    if (isChecked && user?.cardFaces) {
      socket.emit('USE_CUSTOM_FACES', { roomId, cardFaces: user.cardFaces });
      toast.success("Your AI Royal Cards are ready for the deck!");
    } else {
      socket.emit('REMOVE_CUSTOM_FACES', { roomId });
    }
  };

  const getRelativePosition = (playerIndex) => {
    const seat = playingAs === 'ALL' ? 0 : playingAs;
    const diff = (playerIndex - seat + 4) % 4;
    if (diff === 0) return 'pos-bottom-trick';
    if (diff === 1) return 'pos-left-trick';
    if (diff === 2) return 'pos-top-trick';
    if (diff === 3) return 'pos-right-trick';
  };

  return (
    <div className="app-container">
      <header>
        <div>
          <h1><Spade size={24} className="inline-icon" /> Spades Engine</h1>
          <div className="profile-selector" style={{background: 'transparent', border: 'none', padding: 0}}>
            <User size={16} color="#94a3b8" />
            <label style={{color: '#94a3b8', marginLeft: '4px'}}>Playing As: </label>
            <strong style={{color: '#38bdf8', fontSize: '1.2rem', marginLeft: '8px'}}>{players[playingAs]?.name || 'Spectator'}</strong>
          </div>
        </div>
        
        <div className="header-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        
          <div className="header-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          
          {/* ADD THIS WRAPPER TO HOLD BOTH BUTTONS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             <VoiceChat roomId={roomId || urlRoomId} playingAs={playingAs} players={players} />
             
             <button onClick={handleLeaveTable} className="btn btn-error btn-sm btn-outline gap-2 text-xs">
               <LogOut size={14} /> Leave Table
             </button>
          </div>
          
          <p className="round-badge" style={{ margin: 0 }}>Password: <span style={{color: '#facc15'}}>{roomPassword}</span></p>
          <div className="spades-status">Round {round} | Spades Broken: {spadesBroken ? '🔴 Yes' : '⚪ No'}</div>
        </div>
          <p className="round-badge" style={{ margin: 0 }}>Password: <span style={{color: '#facc15'}}>{roomPassword}</span></p>
          <div className="spades-status">Round {round} | Spades Broken: {spadesBroken ? '🔴 Yes' : '⚪ No'}</div>
        </div>
      </header>

      <div className="game-table">
        {phase === 'waiting' && (
          <div className="center-action animate-pop" style={{ maxWidth: '450px' }}>
            <h2>Waiting for Players ({players.filter(p => p.socketId).length}/4)</h2>
            <p style={{marginBottom: '16px', color: '#a2a8d3'}}>First to 26 wins. 1 trick = 1 point.</p>
            
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: '#f8fafc', fontWeight: 'bold' }}>
                <input 
                  type="checkbox" 
                  checked={useCustomFaces} 
                  onChange={handleToggleFaces} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#38bdf8' }} 
                />
                <ImageIcon size={20} color="#38bdf8" /> Use my AI Custom Royal Cards
              </label>
              <p style={{ margin: '8px 0 0 32px', fontSize: '0.85rem', color: '#94a3b8' }}>
                If checked, your personalized Jack, Queen, King, and Ace faces will be injected into this deck.
              </p>
            </div>

            {playingAs === 0 && (
              <button className="btn-primary flex-center" onClick={() => { playSound('click'); socket.emit('START_GAME', roomId); }}>
                <Play size={18} style={{marginRight: '8px'}} /> Deal Cards
              </button>
            )}
          </div>
        )}

        {phase !== 'waiting' && phase !== 'game_over' && (
          <div className="game-table-grid">
       
             {(() => {
              const topP = players[(playingAs + 2) % 4];
              return (
                <div className={`opponent-card pos-top ${currentTurnIndex === topP.id ? 'active-turn' : ''} ${!topP.socketId ? 'dimmed-card' : ''}`}>
                  <h3>{topP.name}</h3>
                  <div className="stats-row"><span>Score: {topP.score}</span> | <span>Bid: {topP.bid !== null ? topP.bid : '?'}</span> | <span>Won: {topP.tricksWon}</span></div>
                  
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                    <span style={{ background: '#38bdf8', color: '#0f172a', padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      🂠 {topP.hand?.length || 0} Cards
                    </span>
                  </div>
                </div>
              );
            })()}

       
             {(() => {
              const leftP = players[(playingAs + 1) % 4];
              return (
                <div className={`opponent-card pos-left ${currentTurnIndex === leftP.id ? 'active-turn' : ''} ${!leftP.socketId ? 'dimmed-card' : ''}`}>
                  <h3>{leftP.name}</h3>
                  <div className="stats-col"><span>Scr: {leftP.score}</span><span>Bid: {leftP.bid !== null ? leftP.bid : '?'}</span><span>Won: {leftP.tricksWon}</span></div>
                  
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                    <span style={{ background: '#38bdf8', color: '#0f172a', padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      🂠 {leftP.hand?.length || 0} Cards
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="trick-area pos-center plus-layout">
              {currentTrick?.length === 0 && phase === 'playing' && <div className="trick-placeholder">Waiting for {players[currentTurnIndex].name} to lead...</div>}
              {currentTrick?.map((play, idx) => (
                <div key={idx} className={`absolute-trick ${getRelativePosition(play.playerIndex)}`} style={{ zIndex: idx + 1 }}>
                  <div className="trick-card-animated">
                    <small className="trick-name-label">{players[play.playerIndex].name}</small>
                    <PlayingCard 
                      card={play.card} 
                      faceDown={false} 
                      customFaceMap={customFaceMap} 
                      isPlayed={true} 
                    />
                  </div>
                </div>
              ))}
            </div>

           {(() => {
              const rightP = players[(playingAs + 3) % 4];
              return (
                <div className={`opponent-card pos-right ${currentTurnIndex === rightP.id ? 'active-turn' : ''} ${!rightP.socketId ? 'dimmed-card' : ''}`}>
                  <h3>{rightP.name}</h3>
                  <div className="stats-col"><span>Scr: {rightP.score}</span><span>Bid: {rightP.bid !== null ? rightP.bid : '?'}</span><span>Won: {rightP.tricksWon}</span></div>
                  
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                    <span style={{ background: '#38bdf8', color: '#0f172a', padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      🂠 {rightP.hand?.length || 0} Cards
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className={`my-area pos-bottom ${isMyTurn ? 'my-turn-active' : ''}`}>
              <div className="my-stats">
                <h2>{players[playingAs]?.name || 'Spectator'} (You)</h2>
                <div className="my-scores">
                  <span>Total Score: <strong>{players[playingAs]?.score || 0}</strong></span><span className="divider">|</span>
                  <span>Bid: <strong>{players[playingAs]?.bid !== null && players[playingAs]?.bid !== undefined ? players[playingAs].bid : '-'}</strong></span><span className="divider">|</span>
                  <span>Won: <strong>{players[playingAs]?.tricksWon || 0}</strong></span>
                </div>
              </div>
              
              {phase === 'bidding' && isMyTurn && (
                <form onSubmit={handleBidSubmit} className="action-form animate-pop">
                  <label style={{color: "white"}}>Enter your bid:</label>
                  <input type="number" min="0" max="13" value={bidInput} onChange={(e) => setBidInput(e.target.value)} autoFocus />
                  <button type="submit" className="btn-primary">Submit</button>
                </form>
              )}

              <div className="my-hand stacked-cards my-stacked-cards">
                {players[playingAs]?.hand?.map(card => {
                  const amIPlaying = phase === 'playing' && isMyTurn;
                  const canPlayCard = amIPlaying ? checkPlayable(players[playingAs].hand, card, currentTrick) : false;
                  const isDimmed = phase === 'playing' && (!isMyTurn || !canPlayCard);
                  return <PlayingCard key={card.id} card={card} faceDown={false} isPlayable={canPlayCard} isDimmed={isDimmed} onClick={() => handlePlayCard(card.id)} customFaceMap={customFaceMap} />;
                })}
              </div>
            </div>
          </div>
        )}

        {phase === 'scoring' && (
          <div className="center-action animate-pop">
            <h2>Round {round} Over!</h2>
            {gameState.overtimeActive && <p style={{color: '#f1c40f', fontWeight: 'bold', margin: '12px 0'}}>⚠️ Tie-Breaker Active! (Overtime {gameState.overtimeRound}/3)</p>}
            <p style={{marginBottom: '16px'}}>Scores calculated.</p>
            {playingAs === 0 && <button className="btn-primary flex-center" onClick={() => { playSound('click'); socket.emit('NEXT_ROUND', roomId); }}><Play size={18} style={{marginRight: '8px'}} /> Deal Round {round + 1}</button>}
          </div>
        )}
        
        {phase === 'game_over' && (
          <div className="center-action animate-pop">
            <h1 style={{color: '#f1c40f', fontSize: '2.5rem', margin: '0 0 16px 0'}}>Game Over!</h1>
            <div style={{background: 'rgba(0,0,0,0.6)', padding: '20px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left', border: '1px solid #f1c40f'}}>
              {[...players].sort((a, b) => b.score - a.score).map((p, index) => (
                <div key={p.id} style={{fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: index === 0 ? '#4ade80' : 'white'}}>
                  {index === 0 && <Crown size={24} color="#facc15" />} {p.name}: <strong>{p.score} pts</strong>
                </div>
              ))}
            </div>
            {playingAs === 0 && <button className="btn-primary" onClick={() => { playSound('click'); socket.emit('START_GAME', roomId); }}>Play Again</button>}
          </div>
        )}
      </div>

      {history?.length > 0 && (
        <div className="table-container animate-pop">
          <div className="table-header-row"><h2><Trophy size={20} className="inline-icon" /> Round History</h2></div>
          <div className="table-scroll-wrapper">
            <table className="score-table">
              <thead><tr><th className="rnd-col">Rnd</th>{players.map(p => <th key={p.id}>{p.name}</th>)}</tr></thead>
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

      {/* SAFELY DROPPED IN AT THE BOTTOM */}
      <DJBooth roomId={roomId || urlRoomId} musicState={musicState} />
    </div>
  );
}