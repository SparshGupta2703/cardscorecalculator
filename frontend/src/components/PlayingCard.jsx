import React from 'react';

const PlayingCard = ({ card, faceDown, onClick, isPlayable, isDimmed }) => {
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

  return (
    <div className={`card ${isRed ? 'red-suit' : 'black-suit'} ${isPlayable ? 'playable' : ''} ${isDimmed ? 'dimmed-card' : ''}`} onClick={isPlayable ? onClick : undefined}>
      <div className="card-top">{displayRank} {suits[card.suit]}</div>
      <div className="card-center">{suits[card.suit]}</div>
      <div className="card-bottom">{displayRank} {suits[card.suit]}</div>
    </div>
  );
};

export default PlayingCard;