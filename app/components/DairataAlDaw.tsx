'use client';

import React, { useEffect, useState } from 'react';
import type { TeamColor } from '../../lib/hexUtils';

interface DairataAlDawProps {
  winnerTeam: TeamColor;
  endTime: number;            // server timestamp
  question: {
    text: string;
    options: string[];
    index: number;
  } | null;
  lastResult: boolean | null; // null = not yet judged, true = correct, false = wrong
  score: number;
  total: number;
  isHost: boolean;
  onJudge: (correct: boolean) => void;
  isEnded: boolean;
  finalScore?: { score: number; total: number };
}

export function DairataAlDaw({
  winnerTeam,
  endTime,
  question,
  lastResult,
  score,
  total,
  isHost,
  onJudge,
  isEnded,
  finalScore,
}: DairataAlDawProps) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));

  useEffect(() => {
    setTimeLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [endTime]);

  const teamLabel = winnerTeam === 'RED' ? 'الفريق الأحمر 🔴' : 'الفريق الأخضر 🟢';
  const teamColor = winnerTeam === 'RED' ? 'text-red-400' : 'text-green-400';
  const timerColor = timeLeft <= 10 ? '#dc2626' : timeLeft <= 20 ? '#f59e0b' : '#16a34a';
  const timerPercent = Math.max(0, (timeLeft / 60) * 100);

  if (isEnded && finalScore) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-10" dir="rtl">
        <h2 className="text-3xl font-bold text-amber-400">انتهت دائرة الضوء!</h2>
        <div className={`text-2xl font-bold ${teamColor}`}>{teamLabel}</div>
        <div className="text-6xl font-bold text-white">
          {finalScore.score} / {finalScore.total}
        </div>
        <p className="text-gray-400">إجابة صحيحة من {finalScore.total} سؤال</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-amber-400">دائرة الضوء</h2>
        <span className={`font-bold ${teamColor}`}>{teamLabel}</span>
      </div>

      {/* Big timer */}
      <div className="text-center">
        <div className="text-7xl font-bold" style={{ color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
          {timeLeft}
        </div>
        <div className="h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-250"
            style={{ width: `${timerPercent}%`, backgroundColor: timerColor }}
          />
        </div>
      </div>

      {/* Score */}
      <div className="text-center text-lg text-gray-300">
        النتيجة: <span className="text-white font-bold">{score}</span> / {total}
      </div>

      {/* Last result flash */}
      {lastResult !== null && (
        <div className={`text-center text-2xl font-bold ${lastResult ? 'text-green-400' : 'text-red-400'}`}>
          {lastResult ? '✅ صحيح!' : '❌ خطأ'}
        </div>
      )}

      {/* Current question */}
      {question && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-600">
          <p className="text-white text-lg font-semibold leading-relaxed mb-3">{question.text}</p>
          <div className="grid grid-cols-2 gap-2">
            {question.options.map((opt, i) => (
              <div
                key={i}
                className="bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 text-center"
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Judge buttons (host only) */}
      {isHost && question && !isEnded && (
        <div className="flex gap-4 justify-center mt-2">
          <button
            onClick={() => onJudge(true)}
            className="flex-1 py-4 bg-green-600 hover:bg-green-500 text-white text-2xl font-bold rounded-2xl transition-colors"
          >
            ✅ صحيح
          </button>
          <button
            onClick={() => onJudge(false)}
            className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white text-2xl font-bold rounded-2xl transition-colors"
          >
            ❌ خطأ
          </button>
        </div>
      )}

      {!isHost && (
        <p className="text-center text-gray-500 text-sm">الكابتن يتحكم في التقييم</p>
      )}
    </div>
  );
}
