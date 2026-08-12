import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import html2canvas from 'html2canvas'; // New Import
import './App.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL 
//  'http://localhost:4000';
const socket = io(SOCKET_URL);

// --- COMPONENT: Editable Player Name ---
const NameInput = ({ player, index, disabled }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localName, setLocalName] = useState(player.name);

  useEffect(() => {
    if (!isEditing) setLocalName(player.name);
  }, [player.name, isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (localName.trim() !== '' && localName !== player.name) {
      socket.emit('UPDATE_PLAYER_NAME', { index, name: localName });
    } else {
      setLocalName(player.name);
    }
  };

  if (isEditing) {
    return (
      <div className="name-input-wrapper">
        <input type="text" className="player-name-input active-edit" value={localName} onChange={(e) => setLocalName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} onBlur={handleSave} autoFocus />
      </div>
    );
  }

  return (
    <div className="name-input-wrapper">
      <div className="player-name-display">
        <span>{player.name}</span>
        {!disabled && <button className="edit-name-btn" onClick={() => setIsEditing(true)}>✎</button>}
      </div>
    </div>
  );
};

// --- COMPONENT: Editable Score Cell (Host Only) ---
const EditableScore = ({ roundIndex, playerIndex, initialValue, isHost }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(initialValue);

  useEffect(() => setVal(initialValue), [initialValue]);

  const handleSave = () => {
    setIsEditing(false);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num !== initialValue) {
      socket.emit('EDIT_SCORE', { roundIndex, playerIndex, newChange: num });
    } else {
      setVal(initialValue);
    }
  };

  if (isEditing && isHost) {
    return (
      <input 
        type="number" className="edit-score-input" value={val} 
        onChange={(e) => setVal(e.target.value)} 
        onBlur={handleSave} onKeyDown={(e) => e.key === 'Enter' && handleSave()} autoFocus 
      />
    );
  }

  return (
    <div 
      className={`score-change ${isHost ? 'host-editable' : ''}`} 
      onClick={() => isHost && setIsEditing(true)}
      title={isHost ? "Click to edit score" : ""}
    >
      {initialValue > 0 ? `+${initialValue}` : initialValue}
    </div>
  );
};


// --- MAIN APP ---
export default function App() {
  const [gameState, setGameState] = useState(null);
  const [bidInput, setBidInput] = useState('');
  const [playingAs, setPlayingAs] = useState('ALL'); 
  const [darkMode, setDarkMode] = useState(false);
  
  const tableRef = useRef(null); // Reference for the Screenshot

  useEffect(() => {
    socket.on('STATE_UPDATE', (state) => {
      setGameState(state);
      if (state.phase === 'bidding') setBidInput('');
    });
    return () => socket.off('STATE_UPDATE');
  }, []);

  if (!gameState) return <div className="loading">Connecting to Spades Server...</div>;

  const { players, currentRound, phase, currentBidderIndex, currentBids, roundOutcomes, history } = gameState;
  const isMyProfile = (idx) => playingAs === 'ALL' || playingAs === idx;

  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (bidInput === '' || isNaN(bidInput)) return;
    socket.emit('SUBMIT_BID', { index: currentBidderIndex, bid: parseInt(bidInput, 10) });
  };

  const handleScoreSubmit = () => {
    if (roundOutcomes.some(val => val === null)) {
      alert('Waiting for all players to mark ✓ or × !');
      return;
    }
    socket.emit('COMPLETE_ROUND');
  };

  // --- SCREENSHOT LOGIC ---
  const handleScreenshot = async () => {
    if (tableRef.current) {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
        scale: 2 // High resolution
      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = image;
      link.download = `Spades_Scores_Round_${currentRound - 1}.png`;
      link.click();
    }
  };

  return (
    <div className={`theme-wrapper ${darkMode ? 'dark-theme' : 'light-theme'}`}>
      <div className="app-container">
        <header>
          <div>
            <h1>Spades Scorekeeper</h1>
            <div className="profile-selector">
              <label>Playing As: </label>
              <select value={playingAs} onChange={(e) => setPlayingAs(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}>
                <option value="ALL">Host (Control All)</option>
                {players.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="header-right">
            <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <p className="round-badge">Round {currentRound}</p>
            {playingAs === 'ALL' && <button className="reset-btn" onClick={() => window.confirm('Reset Game?') && socket.emit('RESET_GAME')}>Reset Game</button>}
          </div>
        </header>

        <section className="players-grid">
          {players.map((p, idx) => {
            const canEdit = isMyProfile(idx);
            return (
              <div key={p.id} className={`player-card ${phase === 'bidding' && currentBidderIndex === idx ? 'active-turn' : ''} ${!canEdit ? 'disabled-card' : ''}`}>
                <NameInput player={p} index={idx} disabled={!canEdit} />
                <div className="total-score">{p.score} pts</div>
                <div className="bid-badge">Bid: {currentBids[idx] !== null ? currentBids[idx] : '-'}</div>
                {phase === 'scoring' && (
                  <div className="decision-buttons">
                    <button disabled={!canEdit} className={`check-btn ${roundOutcomes[idx] === true ? 'selected' : ''}`} onClick={() => socket.emit('TOGGLE_OUTCOME', { index: idx, made: true })}>✓</button>
                    <button disabled={!canEdit} className={`cross-btn ${roundOutcomes[idx] === false ? 'selected' : ''}`} onClick={() => socket.emit('TOGGLE_OUTCOME', { index: idx, made: false })}>×</button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="action-panel">
          {phase === 'bidding' && (
            <div className="bid-container">
              {isMyProfile(currentBidderIndex) ? (
                <form onSubmit={handleBidSubmit} className="bid-form">
                  <label><strong>{players[currentBidderIndex].name}</strong>, enter bid:</label>
                  <input type="number" min="0" max="13" value={bidInput} onChange={(e) => setBidInput(e.target.value)} autoFocus />
                  <button type="submit">Submit</button>
                </form>
              ) : (
                <p>Waiting for <strong>{players[currentBidderIndex].name}</strong> to bid...</p>
              )}
            </div>
          )}
          {phase === 'scoring' && (
            <div className="scoring-action">
              <p>Select ✓ or × for your profile.</p>
              <button className={`submit-round-btn ${roundOutcomes.includes(null) ? 'btn-waiting' : ''}`} onClick={handleScoreSubmit}>
                {roundOutcomes.includes(null) ? 'Waiting on players...' : `Finalize Round ${currentRound}`}
              </button>
            </div>
          )}
        </section>

        {/* --- SCOREBOARD WITH SCREENSHOT REF --- */}
        <div className="table-header-row">
          <h2>Scoreboard</h2>
          {history.length > 0 && (
            <button className="screenshot-btn" onClick={handleScreenshot}>📸 Save Image</button>
          )}
        </div>
        
        <section className="table-container" ref={tableRef}>
          <table className="score-table">
            <thead>
              <tr>
                <th className="rnd-col">Round</th>
                {players.map(p => <th key={p.id}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {history.map((row, rIndex) => (
                <tr key={row.round}>
                  <td className="rnd-col"><strong>R{row.round}</strong></td>
                  {row.playerResults.map((res, pIndex) => (
                    <td key={pIndex} className={`score-cell ${res.change >= 0 ? 'cell-success' : 'cell-fail'}`}>
                      <EditableScore 
                        roundIndex={rIndex} 
                        playerIndex={pIndex} 
                        initialValue={res.change} 
                        isHost={playingAs === 'ALL'} 
                      />
                      <small className="score-details">
                        Bid: {res.bid} &nbsp;|&nbsp; Total: {res.totalAfter}
                      </small>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="totals-row">
                <td className="rnd-col"><strong>Total</strong></td>
                {players.map(p => <td key={p.id}><strong>{p.score}</strong></td>)}
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}