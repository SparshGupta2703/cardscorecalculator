import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SOCKET_URL = 'https://cardscorecalculator.onrender.com:4000';
const socket = io(SOCKET_URL);

// Special Component to prevent cursor jumping while editing names in real-time
// Special Component with an explicit Edit Button
const NameInput = ({ player, index, disabled }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localName, setLocalName] = useState(player.name);

  // Sync from server if not currently typing
  useEffect(() => {
    if (!isEditing) setLocalName(player.name);
  }, [player.name, isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (localName.trim() !== '' && localName !== player.name) {
      socket.emit('UPDATE_PLAYER_NAME', { index, name: localName });
    } else {
      setLocalName(player.name); // Revert if they left it blank
    }
  };

  if (isEditing) {
    return (
      <div className="name-input-wrapper">
        <input
          type="text"
          className="player-name-input active-edit"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          onBlur={handleSave}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="name-input-wrapper">
      <div className="player-name-display">
        <span>{player.name}</span>
        {!disabled && (
          <button 
            className="edit-name-btn" 
            onClick={() => setIsEditing(true)}
            title="Edit Player Name"
          >
            ✎
          </button>
        )}
      </div>
    </div>
  );
};
export default function App() {
  const [gameState, setGameState] = useState(null);
  const [bidInput, setBidInput] = useState('');
  const [playingAs, setPlayingAs] = useState('ALL'); // 'ALL' or player index 0,1,2,3

  useEffect(() => {
    socket.on('STATE_UPDATE', (state) => {
      setGameState(state);
      if (state.phase === 'bidding') setBidInput('');
    });
    return () => socket.off('STATE_UPDATE');
  }, []);

  if (!gameState) return <div className="loading">Connecting to Spades Server...</div>;

  const { players, currentRound, phase, currentBidderIndex, currentBids, roundOutcomes, history } = gameState;

  // Helper function to check if the current user has permission to interact with this player's controls
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

  return (
    <div className="app-container">
      <header>
        <div>
          <h1>Spades Scorekeeper</h1>
          {/* PROFILE SELECTOR */}
          <div className="profile-selector">
            <label>Playing As: </label>
            <select value={playingAs} onChange={(e) => setPlayingAs(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}>
              <option value="ALL">Host (Control All)</option>
              {players.map((p, i) => (
                <option key={i} value={i}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="header-right">
          <p className="round-badge">Round {currentRound}</p>
          <button className="reset-btn" onClick={() => window.confirm('Reset Game?') && socket.emit('RESET_GAME')}>
            Reset Game
          </button>
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
                  <button
                    disabled={!canEdit}
                    className={`check-btn ${roundOutcomes[idx] === true ? 'selected' : ''}`}
                    onClick={() => socket.emit('TOGGLE_OUTCOME', { index: idx, made: true })}
                  >✓</button>
                  <button
                    disabled={!canEdit}
                    className={`cross-btn ${roundOutcomes[idx] === false ? 'selected' : ''}`}
                    onClick={() => socket.emit('TOGGLE_OUTCOME', { index: idx, made: false })}
                  >×</button>
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
            <button 
              className={`submit-round-btn ${roundOutcomes.includes(null) ? 'btn-waiting' : ''}`} 
              onClick={handleScoreSubmit}
            >
              {roundOutcomes.includes(null) ? 'Waiting on players...' : `Finalize Round ${currentRound}`}
            </button>
          </div>
        )}
      </section>

      {/* Scoreboard remains mostly identical */}
      <section className="table-container">
        <h2>Scoreboard</h2>
        <table className="score-table">
          <thead>
            <tr>
              <th>Round</th>
              {players.map(p => <th key={p.id}>{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.round}>
                <td><strong>R{row.round}</strong></td>
                {row.playerResults.map((res, i) => (
                  <td key={i} className={`score-cell ${res.made ? 'cell-success' : 'cell-fail'}`}>
                    <div>{res.made ? `+${res.change}` : res.change}</div>
                    <small>(Bid: {res.bid} | Total: {res.totalAfter})</small>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="totals-row">
              <td><strong>Total</strong></td>
              {players.map(p => <td key={p.id}><strong>{p.score}</strong></td>)}
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}