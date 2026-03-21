'use client';

import React, { useEffect, useState } from 'react';
import type { TeamColor } from '../../lib/hexUtils';

interface QuestionModalProps {
  letter: string;
  text: string;
  options: string[];
  endTime: number;             // timestamp from server (Date.now() + 30s)
  currentTeam: TeamColor;
  myTeam: TeamColor | null;    // null for host
  isHost: boolean;
  answerLocked: boolean;       // true after someone answered correctly
  correctIndex: number | null; // revealed after lock or timeout
  onAnswer: (index: number) => void;
}

export function QuestionModal({
  letter,
  text,
  options,
  endTime,
  currentTeam,
  myTeam,
  isHost,
  answerLocked,
  correctIndex,
  onAnswer,
}: QuestionModalProps) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
  const [selected, setSelected] = useState<number | null>(null);

  const canAnswer = !isHost && myTeam === currentTeam && !answerLocked && selected === null;

  // Countdown timer
  useEffect(() => {
    setTimeLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [endTime]);

  // Reset selection when a new question arrives (text changes)
  useEffect(() => {
    setSelected(null);
  }, [text]);

  const handleAnswer = (index: number) => {
    if (!canAnswer) return;
    setSelected(index);
    onAnswer(index);
  };

  const timerPercent = Math.max(0, (timeLeft / 30) * 100);
  const timerColor = timeLeft <= 5 ? '#FF2C2C' : timeLeft <= 10 ? '#FFD700' : '#00FF7F';

  const isRedTeam = currentTeam === 'RED';
  const teamBorderColor = isRedTeam ? 'rgba(255,44,44,0.6)' : 'rgba(0,200,83,0.6)';
  const teamGlowColor = isRedTeam ? 'rgba(255,44,44,0.2)' : 'rgba(0,200,83,0.2)';
  const teamTextColor = isRedTeam ? '#FF4444' : '#00FF7F';
  const teamLabel = isRedTeam ? 'الفريق الأحمر' : 'الفريق الأخضر';

  const getOptionStyle = (i: number): string => {
    if (correctIndex !== null && (answerLocked || timeLeft === 0)) {
      if (i === correctIndex) return 'option-btn correct';
      if (i === selected && i !== correctIndex) return 'option-btn wrong';
      return 'option-btn opacity-40 cursor-not-allowed';
    }
    if (i === selected) return 'option-btn selected';
    if (canAnswer) return 'option-btn cursor-pointer';
    return 'option-btn opacity-60 cursor-not-allowed';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5"
        dir="rtl"
        style={{
          background: 'rgba(6,10,23,0.97)',
          border: `2px solid ${teamBorderColor}`,
          boxShadow: `0 -10px 40px ${teamGlowColor}, 0 0 0 1px rgba(255,255,255,0.03)`,
        }}
      >
        {/* Header — حرف + فريق */}
        <div className="flex items-center justify-between mb-3">
          <div
            className="text-2xl font-black px-3 py-1 rounded-lg"
            style={{
              color: '#C9A227',
              textShadow: '0 0 12px rgba(201,162,39,0.7)',
              background: 'rgba(201,162,39,0.08)',
              border: '1px solid rgba(201,162,39,0.3)',
            }}
          >
            {letter}
          </div>
          <span
            className="text-sm font-black tracking-widest"
            style={{ color: teamTextColor, textShadow: `0 0 8px ${teamTextColor}` }}
          >
            ● {teamLabel}
          </span>
        </div>

        {/* شريط المؤقت */}
        <div
          className="h-2 rounded-full mb-2 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-250"
            style={{
              width: `${timerPercent}%`,
              background: `linear-gradient(90deg, ${timerColor}, ${timerColor}80)`,
              boxShadow: `0 0 6px ${timerColor}`,
              transition: 'width 0.25s linear',
            }}
          />
        </div>
        <div
          className="text-center text-2xl font-black mb-3"
          style={{
            color: timerColor,
            textShadow: `0 0 10px ${timerColor}`,
            fontFamily: 'Courier New, monospace',
          }}
        >
          {timeLeft}
        </div>

        {/* نص السؤال */}
        <p
          className="text-lg font-semibold text-center mb-5 leading-relaxed"
          style={{ color: '#E8E8F0' }}
        >
          {text}
        </p>

        {/* الخيارات */}
        <div className="grid grid-cols-1 gap-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              disabled={!canAnswer}
              className={getOptionStyle(i)}
            >
              <span
                className="font-black ml-2 text-sm"
                style={{ color: '#C9A227' }}
              >
                {['أ','ب','ج','د'][i]}.
              </span>
              {opt}
            </button>
          ))}
        </div>

        {/* رسالة الحالة */}
        {answerLocked && (
          <p className="text-center text-sm font-black mt-4"
            style={{ color: '#69F0AE', textShadow: '0 0 8px rgba(0,255,127,0.5)' }}>
            ✓ تم تسجيل الإجابة الصحيحة!
          </p>
        )}
        {!canAnswer && !isHost && myTeam !== currentTeam && (
          <p className="text-center text-eid-sand/40 mt-3 text-xs tracking-wide">دور الفريق الآخر — انتظر</p>
        )}
        {isHost && (
          <p className="text-center text-eid-sand/30 mt-3 text-xs tracking-wide">الكابتن — مشاهدة فقط</p>
        )}
      </div>
    </div>
  );
}

