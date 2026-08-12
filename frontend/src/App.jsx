import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL 
// const SOCKET_URL = 'http://localhost:4000';


const socket = io(SOCKET_URL);

// Frontend visual validator (mirrors backend logic)
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
  if (faceDown) {
    return <div className="card face-down">🂠</div>;
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
  const [gameState, setGameState] = useState(null);
  const [playingAs, setPlayingAs] = useState('ALL'); 
  const [bidInput, setBidInput] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    socket.on('STATE_UPDATE', (state) => {
      setGameState(state);
      if (state.phase === 'bidding') setBidInput('');
    });

    socket.on('INVALID_PLAY', (msg) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    });

    return () => {
      socket.off('STATE_UPDATE');
      socket.off('INVALID_PLAY');
    };
  }, []);

  if (!gameState) return <div className="loading">Connecting to Spades Table...</div>;

  const { players, phase, currentTurnIndex, currentTrick, spadesBroken, round, history } = gameState;
  const isMyTurn = phase !== 'waiting' && playingAs === currentTurnIndex;

  const handleBidSubmit = (e) => {
    e.preventDefault();
    if (bidInput === '' || isNaN(bidInput)) return;
    socket.emit('SUBMIT_BID', { index: currentTurnIndex, bid: parseInt(bidInput, 10) });
  };

  const handlePlayCard = (cardId) => {
    if (!isMyTurn || phase !== 'playing' || currentTrick.length >= 4) return;
    socket.emit('PLAY_CARD', { playerIndex: playingAs, cardId });
  };

  return (
    <div className="theme-wrapper dark-theme">
      <div className="app-container">
        
        {/* HEADER */}
        <header>
          <div>
            <h1>♠ Spades Engine</h1>
            <div className="profile-selector">
              <label>Seat: </label>
              <select value={playingAs} onChange={(e) => setPlayingAs(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}>
                <option value="ALL">Spectator (Host)</option>
                {players.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="header-right">
            <p className="round-badge">Round {round}</p>
            <div className="spades-status">
              Spades Broken: {spadesBroken ? '🔴 Yes' : '⚪ No'}
            </div>
          </div>
        </header>

        {errorMsg && <div className="error-toast">⚠️ {errorMsg}</div>}

        {/* VIRTUAL TABLE */}
        <div className="game-table">
          
          {phase === 'waiting' && (
            <div className="center-action animate-pop">
              <h2>Ready to play?</h2>
              <p style={{marginBottom: '16px', color: '#a2a8d3'}}>First to 26 wins. 1 trick = 1 point.</p>
              {(playingAs === 'ALL' || playingAs === 0) && (
                <button className="btn-primary" onClick={() => socket.emit('START_GAME')}>Deal Cards</button>
              )}
            </div>
          )}

          {phase !== 'waiting' && phase !== 'game_over' && (
            <>
              {/* OPPONENTS AREA */}
              <div className="opponents-area">
                {players.map((p, i) => {
                  if (playingAs === i) return null;
                  return (
                    <div key={p.id} className={`opponent-card ${currentTurnIndex === i ? 'active-turn' : ''}`}>
                      <h3>{p.name}</h3>
                      <div className="stats" style={{fontWeight: 'bold', color: '#fff'}}>
                        <span>Score: {p.score}</span>
                      </div>
                      <div className="stats">
                        <span>Bid: {p.bid !== null ? p.bid : '?'}</span>
                        <span>Won: {p.tricksWon}</span>
                      </div>
                      <div className="opponent-hand">
                        {p.hand?.map((_, idx) => (
                          <PlayingCard key={idx} faceDown={true} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CENTER: THE TRICK */}
              <div className="trick-area">
                {currentTrick?.length === 0 && phase === 'playing' && (
                  <div className="trick-placeholder">Waiting for {players[currentTurnIndex].name} to lead...</div>
                )}
                {currentTrick?.map((play, idx) => (
                  <div key={idx} className="trick-card">
                    <small>{players[play.playerIndex].name}</small>
                    <PlayingCard card={play.card} faceDown={false} />
                  </div>
                ))}
              </div>

              {/* BOTTOM: CURRENT PLAYER (YOU) */}
              {playingAs !== 'ALL' && (
                <div className={`my-area ${isMyTurn ? 'my-turn-active' : ''}`}>
                  <div className="my-stats">
                    <h2>{players[playingAs].name} (You)</h2>
                    <div className="my-scores">
                      <span>Total Score: <strong>{players[playingAs].score}</strong></span>
                      <span> | Bid: <strong>{players[playingAs].bid !== null ? players[playingAs].bid : '-'}</strong></span>
                      <span> | Won: <strong>{players[playingAs].tricksWon}</strong></span>
                    </div>
                  </div>
                  
                  {/* Bidding Phase Form */}
                  {phase === 'bidding' && isMyTurn && (
                    <form onSubmit={handleBidSubmit} className="action-form animate-pop">
                      <label style={{color: "white"}}>Enter your bid:</label>
                      <input type="number" min="0" max="13" value={bidInput} onChange={(e) => setBidInput(e.target.value)} autoFocus />
                      <button type="submit" className="btn-primary">Submit</button>
                    </form>
                  )}

                  {/* Playing Phase - My Hand */}
                  <div className="my-hand">
                    {players[playingAs]?.hand?.map(card => {
                      const amIPlaying = phase === 'playing' && isMyTurn;
                      const canPlayCard = amIPlaying ? checkPlayable(players[playingAs].hand, card, currentTrick) : false;
                      const isDimmed = phase === 'playing' && (!isMyTurn || !canPlayCard);

                      return (
                        <PlayingCard 
                          key={card.id} 
                          card={card} 
                          faceDown={false} 
                          isPlayable={canPlayCard}
                          isDimmed={isDimmed}
                          onClick={() => handlePlayCard(card.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* SCORING OVERLAY */}
          {phase === 'scoring' && (
            <div className="center-action animate-pop">
              <h2>Round {round} Over!</h2>
              {gameState.overtimeActive && (
                <p style={{color: '#f1c40f', fontWeight: 'bold', margin: '12px 0'}}>
                  ⚠️ Tie-Breaker Active! (Overtime Round {gameState.overtimeRound}/3)
                </p>
              )}
              <p style={{marginBottom: '16px'}}>Scores have been calculated.</p>
              {(playingAs === 'ALL' || playingAs === 0) && (
                <button className="btn-primary" onClick={() => socket.emit('NEXT_ROUND')}>Deal Round {round + 1}</button>
              )}
            </div>
          )}

          {/* GAME OVER SCREEN */}
          {phase === 'game_over' && (
            <div className="center-action animate-pop">
              <h1 style={{color: '#f1c40f', fontSize: '2.5rem', margin: '0 0 16px 0'}}>Game Over!</h1>
              <div style={{background: 'rgba(0,0,0,0.6)', padding: '20px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left', border: '1px solid #f1c40f'}}>
                {[...players].sort((a, b) => b.score - a.score).map((p, index) => (
                  <div key={p.id} style={{fontSize: '1.2rem', marginBottom: '8px', color: index === 0 ? '#4ade80' : 'white'}}>
                    {index === 0 ? '🏆 ' : ''}{p.name}: <strong>{p.score} pts</strong>
                  </div>
                ))}
              </div>
              {(playingAs === 'ALL' || playingAs === 0) && (
                <button className="btn-primary" onClick={() => socket.emit('START_GAME')}>Play Again</button>
              )}
            </div>
          )}
        </div>

        {/* RESTORED SCOREBOARD TABLE */}
        {history?.length > 0 && (
          <div className="table-container" style={{ marginTop: '32px', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
            <div className="table-header-row" style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
              <h2 style={{ color: 'white' }}>Round History</h2>
            </div>
            <table className="score-table" style={{ background: '#1e293b' }}>
              <thead>
                <tr>
                  <th className="rnd-col" style={{ color: '#94a3b8' }}>Rnd</th>
                  {players.map(p => <th key={p.id} style={{ color: '#94a3b8' }}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.round}>
                    <td className="rnd-col" style={{ color: 'white', borderBottom: '1px solid #334155' }}><strong>R{row.round}</strong></td>
                    {row.playerResults.map((res, i) => (
                      <td key={i} className={`score-cell ${res.change > 0 ? 'cell-success' : 'cell-fail'}`} style={{ borderBottom: '1px solid #334155' }}>
                        <div className="score-change">{res.change > 0 ? `+${res.change}` : res.change}</div>
                        <small className="score-details" style={{ display: 'block', color: '#94a3b8' }}>
                          Bid: {res.bid} | Won: {res.won}
                        </small>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}