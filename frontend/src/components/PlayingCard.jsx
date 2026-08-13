import React from 'react';

const PlayingCard = ({ card, faceDown, onClick, isPlayable, isDimmed, customFaceMap }) => {
  if (faceDown || card.suit === 'hidden') {
    return <div className="card face-down"><div className="card-pattern"></div></div>;
  }
  
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  
  let displayRank = card.rank;
  if (card.rank === 11) displayRank = 'J';
  if (card.rank === 12) displayRank = 'Q';
  if (card.rank === 13) displayRank = 'K';
  if (card.rank === 14) displayRank = 'A';

  // Check if this rank has a custom selfie
  const customImage = customFaceMap ? customFaceMap[card.rank] : null;

  return (
    <div className={`card ${isRed ? 'red-suit' : 'black-suit'} ${isPlayable ? 'playable' : ''} ${isDimmed ? 'dimmed-card' : ''}`} onClick={isPlayable ? onClick : undefined}>
      
      {/* Top Left Corner */}
      <div className="card-top">
        {displayRank} <br/> {suits[card.suit]}
      </div>
      
      {/* Dead Center */}
      <div className="card-center">
        {customImage ? (
          <img 
            src={customImage} 
            alt="face" 
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              objectFit: 'cover', 
              border: `2px solid ${isRed ? '#ef4444' : '#0f172a'}`,
              display: 'block' // Removes weird image baseline gaps
            }} 
          />
        ) : (
          suits[card.suit]
        )}
      </div>

      {/* Bottom Right Corner */}
      <div className="card-bottom">
        {displayRank} <br/> {suits[card.suit]}
      </div>
      
    </div>
  );
};

export default PlayingCard;