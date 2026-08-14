import React from 'react';

export default function PlayingCard({ card, faceDown, isPlayable, isDimmed, onClick, customFaceMap, isPlayed }) {
  if (faceDown) {
    return (
      <div className="w-[80px] h-[115px] rounded-xl shadow-md bg-slate-800 border-2 border-slate-600 flex items-center justify-center">
        <div className="text-slate-600 text-3xl opacity-20">♠</div>
      </div>
    );
  }

  const isRoyal = card.rank >= 11;
  const customImage = customFaceMap && customFaceMap[card.rank];

  // Suit symbols and colors
  const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const textColor = isRed ? 'text-red-500' : 'text-slate-900';
  const borderColor = isRed ? 'border-red-500' : 'border-slate-900';
  
  const rankDisplay = card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank === 14 ? 'A' : card.rank;

  return (
    <div 
      onClick={isPlayable && !isDimmed ? onClick : undefined}
      className={`
        w-[80px] h-[115px] relative flex flex-col justify-between p-1.5 rounded-xl border-2 border-slate-300 bg-white shadow-lg
        transition-all duration-200 ease-in-out select-none
        ${textColor}
        ${isPlayable ? 'cursor-pointer hover:-translate-y-2' : ''} 
        ${isDimmed ? 'opacity-40 grayscale' : ''} 
        ${isPlayed ? 'animate-throw' : ''} 
      `}
    >
      {/* Top Left */}
      <div className="flex flex-col leading-none text-sm font-bold">
        <span>{rankDisplay}</span>
        <span className="text-xs">{suitSymbols[card.suit]}</span>
      </div>

      {/* Center Badge / Solid Suit */}
      <div className="flex-grow flex items-center justify-center">
        {isRoyal && customImage ? (
          <div className={`w-[42px] h-[42px] rounded-full overflow-hidden border-2 shadow-sm ${borderColor}`}>
            <img 
              src={customImage} 
              alt="Custom Face" 
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <span className="text-4xl">{suitSymbols[card.suit]}</span>
        )}
      </div>

      {/* Bottom Right (Upside Down) */}
      <div className="flex flex-col items-end leading-none text-sm font-bold rotate-180">
        <span>{rankDisplay}</span>
        <span className="text-xs">{suitSymbols[card.suit]}</span>
      </div>
    </div>
  );
}