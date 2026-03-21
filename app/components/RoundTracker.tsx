'use client';

import React from 'react';
import type { TeamColor } from '../../lib/hexUtils';

interface RoundTrackerProps {
  currentRound: number;
  roundWins: Record<TeamColor, number>;
  totalRounds?: number;    // default 5
  winsRequired?: number;   // default 3
}

export function RoundTracker({
  currentRound,
  roundWins,
  totalRounds = 5,
  winsRequired = 3,
}: RoundTrackerProps) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  // Build round result history from wins — simplified: show filled circles
  const redWins = roundWins.RED;
  const greenWins = roundWins.GREEN;

  return (
    <div className="flex flex-col items-center gap-2 py-2" dir="rtl">
      <div className="flex items-center gap-3">
        {/* Red score — LED style */}
        <div className="flex items-center gap-1">
          <span
            className="text-2xl font-black led-display"
            style={{ color: '#FF4444', borderColor: '#FF4444' }}
          >
            {redWins}
          </span>
          <span className="text-xs text-red-500/60 font-bold">أحمر</span>
        </div>

        {/* Round dots */}
        <div className="flex gap-1">
          {rounds.map(r => {
            const isCurrentRound = r === currentRound;
            const redFilled = r <= redWins;
            const greenFilled = r <= greenWins;
            let dotBg = 'rgba(255,255,255,0.08)';
            let dotShadow = 'none';
            if (redFilled) { dotBg = '#FF4444'; dotShadow = '0 0 6px #FF4444'; }
            else if (greenFilled) { dotBg = '#00C853'; dotShadow = '0 0 6px #00FF7F'; }

            return (
              <div
                key={r}
                className="w-4 h-4 rounded-full transition-all duration-300"
                style={{
                  background: dotBg,
                  boxShadow: dotShadow,
                  outline: isCurrentRound ? '2px solid #C9A227' : 'none',
                  outlineOffset: '2px',
                }}
                title={`جولة ${r}`}
              />
            );
          })}
        </div>

        {/* Green score — LED style */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-green-500/60 font-bold">أخضر</span>
          <span
            className="text-2xl font-black led-display"
            style={{ color: '#00FF7F', borderColor: '#00FF7F' }}
          >
            {greenWins}
          </span>
        </div>
      </div>

      <div className="text-xs tracking-wide" style={{ color: 'rgba(200,200,216,0.3)' }}>
        الجولة {currentRound} من {totalRounds} — الفوز بـ {winsRequired} جولات
      </div>
    </div>
  );
}
