import React from 'react';

export default function PlayingCard({ card, faceDown, isPlayable, isDimmed, onClick, customFaceMap }) {
  if (faceDown) {
    return (
      <div className="card-base card-back shadow-md">
        <div className="card-back-pattern">♠</div>
      </div>
    );
  }

  const isRoyal = card.rank >= 11;
  const customImage = customFaceMap && customFaceMap[card.rank];

  // Suit symbols and colors
  const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const rankDisplay = card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank === 14 ? 'A' : card.rank;

  return (
    <div 
      onClick={isPlayable && !isDimmed ? onClick : undefined}
      className={`card-base card-front ${isPlayable ? 'card-playable cursor-pointer hover:-translate-y-2' : ''} ${isDimmed ? 'opacity-40 grayscale' : ''} shadow-lg`}
      style={{
        background: '#ffffff',
        color: isRed ? '#ef4444' : '#0f172a',
        borderRadius: '12px',
        width: '80px',
        height: '115px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '6px',
        boxSizing: 'border-box',
        border: '2px solid #cbd5e1',
        transition: 'transform 0.2s ease, filter 0.2s ease'
      }}
    >
      {/* Top Left */}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1', fontSize: '0.85rem', fontWeight: 'bold' }}>
        <span>{rankDisplay}</span>
        <span style={{ fontSize: '0.75rem' }}>{suitSymbols[card.suit]}</span>
      </div>

      {/* Center Circular Badge (Restored) */}
      <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isRoyal && customImage ? (
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            overflow: 'hidden',
            border: `2px solid ${isRed ? '#ef4444' : '#0f172a'}`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
          }}>
            <img 
              src={customImage} 
              alt="Custom Face" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          </div>
        ) : (
          <span style={{ fontSize: '1.8rem', opacity: 0.15 }}>{suitSymbols[card.suit]}</span>
        )}
      </div>

      {/* Bottom Right */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1', fontSize: '0.85rem', fontWeight: 'bold', transform: 'rotate(180deg)' }}>
        <span>{rankDisplay}</span>
        <span style={{ fontSize: '0.75rem' }}>{suitSymbols[card.suit]}</span>
      </div>
    </div>
  );
}