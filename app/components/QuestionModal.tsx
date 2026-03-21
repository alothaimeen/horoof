'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { TeamColor } from '../../lib/hexUtils';

type ModalPhase =
  | 'CELL_SELECTION'
  | 'BUZZER'
  | 'BUZZER_SECOND_CHANCE'
  | 'BUZZER_OPEN'
  | 'ANSWERING'
  | 'ANSWER_REVEAL'
  | 'ROUND_OVER'
  | 'GAME_OVER'
  | 'DAIRAT_AL_DAW'
  | 'TIEBREAKER';

interface QuestionModalProps {
  letter: string;
  text: string;
  options: string[];
  endTime: number;
  timerMaxSec: number;
  currentTeam: TeamColor;
  myTeam: TeamColor | null;
  isHost: boolean;
  answerLocked: boolean;
  correctIndex: number | null;
  phase: ModalPhase;
  buzzerTeam: TeamColor | null;
  openAnswerTeam: TeamColor | null;
  openRevealStartTime: number | null;
  optionRevealTime: number | null;
  buzzerOpenTime: number | null;
  mayBuzz: boolean;
  isTiebreaker?: boolean;
  onAnswer: (index: number) => void;
  onBuzzIn: () => void;
}

export function QuestionModal({
  letter,
  text,
  options,
  endTime,
  timerMaxSec,
  currentTeam,
  myTeam,
  isHost,
  answerLocked,
  correctIndex,
  phase,
  buzzerTeam,
  openAnswerTeam,
  openRevealStartTime,
  optionRevealTime,
  buzzerOpenTime,
  mayBuzz,
  isTiebreaker = false,
  onAnswer,
  onBuzzIn,
}: QuestionModalProps) {
  const [timeLeft, setTimeLeft] = useState<number>(timerMaxSec);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [buzzerCanBuzz, setBuzzerCanBuzz] = useState<boolean>(false);
  const [buzzerCountdown, setBuzzerCountdown] = useState<number>(30);
  const rafRef = useRef<number | null>(null);

  const isAnsweringPhase = phase === 'ANSWERING' || (phase === 'TIEBREAKER' && buzzerTeam !== null);
  const isBuzzerPhase = phase === 'BUZZER' || phase === 'TIEBREAKER';
  const isOpenPhase = phase === 'BUZZER_OPEN';
  const isRevealPhase = correctIndex !== null;

  // For option visibility: in buzzer phase show gradually, but always show all when answering
  const effectiveRevealedCount = isAnsweringPhase ? options.length : revealedCount;

  const teamColor = (team: TeamColor) => team === 'RED' ? '#FF4444' : '#00FF7F';
  const teamLabel = (team: TeamColor) => team === 'RED' ? '🔴 الفريق الأحمر' : '🟢 الفريق الأخضر';

  // ── Generic countdown (ANSWERING / BUZZER_OPEN / BUZZER_SECOND_CHANCE) ──
  useEffect(() => {
    if (!isAnsweringPhase && !isOpenPhase && phase !== 'BUZZER_SECOND_CHANCE') return;
    if (endTime <= 0) return;

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isAnsweringPhase, isOpenPhase, phase, endTime]);

  // ── Gradual option reveal + buzzer countdown (BUZZER / TIEBREAKER) ──
  useEffect(() => {
    if (!isBuzzerPhase || !optionRevealTime) {
      if (!isBuzzerPhase) setRevealedCount(options.length);
      setBuzzerCanBuzz(false);
      setBuzzerCountdown(30);
      return;
    }

    const update = () => {
      const now = Date.now();
      const elapsed = now - optionRevealTime;
      const count = elapsed < 0 ? 0 : Math.min(options.length, Math.floor(elapsed / 1000) + 1);
      setRevealedCount(count);

      if (buzzerOpenTime && now >= buzzerOpenTime) {
        setBuzzerCanBuzz(true);
        setBuzzerCountdown(Math.max(0, Math.ceil((buzzerOpenTime + 30000 - now) / 1000)));
      } else {
        setBuzzerCanBuzz(false);
      }
    };

    update(); // run immediately on mount/dependency change
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [isBuzzerPhase, optionRevealTime, buzzerOpenTime, options.length]);

  const borderColor = currentTeam === 'RED' ? 'rgba(255,68,68,0.5)' : 'rgba(0,255,127,0.5)';
  const glowColor = currentTeam === 'RED' ? 'rgba(255,44,44,0.2)' : 'rgba(0,255,127,0.2)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background: '#1a1a2e',
          border: `1.5px solid ${borderColor}`,
          boxShadow: `0 0 40px ${glowColor}`,
          maxHeight: '95vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black"
            style={{ background: borderColor, color: '#0d0d1a' }}
          >
            {letter}
          </div>
          <div className="text-center flex-1 px-3">
            {isTiebreaker && (
              <p className="text-xs font-bold tracking-widest mb-1" style={{ color: '#C9A227' }}>
                🏆 سؤال تحديد البداية
              </p>
            )}
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {teamLabel(currentTeam)}
            </p>
          </div>

          {/* Timer badge */}
          {isAnsweringPhase && (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black"
              style={{
                background: timeLeft <= 5 ? 'rgba(255,44,44,0.3)' : 'rgba(255,255,255,0.07)',
                color: timeLeft <= 5 ? '#FF4444' : 'rgba(255,255,255,0.8)',
                border: `1.5px solid ${timeLeft <= 5 ? 'rgba(255,44,44,0.5)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {timeLeft}
            </div>
          )}
          {isBuzzerPhase && buzzerCanBuzz && (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black"
              style={{
                background: buzzerCountdown <= 5 ? 'rgba(255,44,44,0.3)' : 'rgba(255,255,255,0.07)',
                color: buzzerCountdown <= 5 ? '#FF4444' : 'rgba(255,255,255,0.8)',
                border: `1.5px solid ${buzzerCountdown <= 5 ? 'rgba(255,44,44,0.5)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {buzzerCountdown}
            </div>
          )}
        </div>

        {/* Question text */}
        <p className="text-lg font-bold text-center leading-snug" style={{ color: 'rgba(255,255,255,0.92)' }}>
          {text}
        </p>

        {/* Show answer when no one buzzed */}
        {correctIndex !== null && !isAnsweringPhase && (
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: 'rgba(0,255,127,0.08)', border: '1.5px solid rgba(0,255,127,0.3)' }}
          >
            <p className="text-sm font-bold" style={{ color: '#00FF7F' }}>
              📖 الإجابة الصحيحة هي: {options[correctIndex]}
            </p>
          </div>
        )}

        {/* Options */}
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => {
            // In buzzer/tiebreaker phase, reveal options gradually (but show all when answering)
            const isVisible = isBuzzerPhase ? i < effectiveRevealedCount : true;

            if (!isVisible) {
              return (
                <div
                  key={i}
                  className="rounded-xl p-3"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1.5px dashed rgba(255,255,255,0.1)',
                    minHeight: '44px',
                  }}
                />
              );
            }

            const style = getOptionStyle(i, correctIndex, answerLocked, isRevealPhase);
            const canAnswer = isAnsweringPhase && !answerLocked && !isHost && myTeam === buzzerTeam;
            const canAnswerOpen = isOpenPhase && !answerLocked && !isHost;

            return (
              <button
                key={i}
                onClick={() => (canAnswer || canAnswerOpen) ? onAnswer(i) : undefined}
                disabled={!(canAnswer || canAnswerOpen)}
                className="rounded-xl p-3 text-right font-semibold text-sm transition-all duration-200"
                style={{
                  ...style,
                  cursor: (canAnswer || canAnswerOpen) ? 'pointer' : 'default',
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateX(0)' : 'translateX(20px)',
                  transition: 'opacity 0.4s ease, transform 0.4s ease',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>
                  {String.fromCharCode(0x0041 + i)}.
                </span>{' '}
                {opt}
              </button>
            );
          })}
        </div>

        {/* Buzz-in button (BUZZER / TIEBREAKER / BUZZER_SECOND_CHANCE phases) */}
        {((isBuzzerPhase && buzzerCanBuzz && !buzzerTeam) || phase === 'BUZZER_SECOND_CHANCE') && mayBuzz && (
          <button
            onClick={onBuzzIn}
            className="w-full py-4 rounded-xl font-black text-lg tracking-wide transition-all duration-150 active:scale-95"
            style={{
              background: myTeam === 'RED' ? 'rgba(255,44,44,0.2)' : 'rgba(0,255,127,0.15)',
              border: `2px solid ${myTeam === 'RED' ? 'rgba(255,44,44,0.7)' : 'rgba(0,255,127,0.6)'}`,
              color: myTeam === 'RED' ? '#FF6666' : '#00FF7F',
              boxShadow: `0 0 20px ${myTeam === 'RED' ? 'rgba(255,44,44,0.25)' : 'rgba(0,255,127,0.2)'}`,
            }}
          >
            🔔 أعرف الإجابة!
          </button>
        )}

        {/* Showing who buzzed in */}
        {isBuzzerPhase && buzzerTeam && !isAnsweringPhase && (
          <div
            className="rounded-xl p-3 text-center"
            style={{
              background: buzzerTeam === 'RED' ? 'rgba(255,44,44,0.1)' : 'rgba(0,255,127,0.08)',
              border: `1.5px solid ${teamColor(buzzerTeam)}40`,
            }}
          >
            <p className="text-sm font-bold" style={{ color: teamColor(buzzerTeam) }}>
              {teamLabel(buzzerTeam)} ضغط الجرس!
            </p>
          </div>
        )}

        {/* ANSWERING: waiting for host to accept/reject or contestant to answer */}
        {isAnsweringPhase && buzzerTeam && (
          <div
            className="rounded-xl p-3 text-center"
            style={{
              background: buzzerTeam === 'RED' ? 'rgba(255,44,44,0.1)' : 'rgba(0,255,127,0.08)',
              border: `1.5px solid ${teamColor(buzzerTeam)}40`,
            }}
          >
            <p className="text-sm font-bold" style={{ color: teamColor(buzzerTeam) }}>
              {teamLabel(buzzerTeam)} يجيب الآن
            </p>
            {isHost && (
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                في انتظار الإجابة...
              </p>
            )}
          </div>
        )}

        {/* BUZZER_OPEN phase info */}
        {isOpenPhase && openAnswerTeam && (
          <div
            className="rounded-xl p-3 text-center"
            style={{
              background: openAnswerTeam === 'RED' ? 'rgba(255,44,44,0.1)' : 'rgba(0,255,127,0.08)',
              border: `1.5px solid ${teamColor(openAnswerTeam)}40`,
            }}
          >
            <p className="text-sm font-bold" style={{ color: teamColor(openAnswerTeam) }}>
              {teamLabel(openAnswerTeam)} يجيب — فرصة أخيرة
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getOptionStyle(
  index: number,
  correctIndex: number | null,
  answerLocked: boolean,
  isRevealPhase: boolean,
): React.CSSProperties {
  if (isRevealPhase && correctIndex !== null) {
    if (index === correctIndex) {
      return {
        background: 'rgba(0,255,127,0.15)',
        border: '1.5px solid rgba(0,255,127,0.6)',
        color: '#00FF7F',
      };
    }
    return {
      background: 'rgba(255,255,255,0.03)',
      border: '1.5px solid rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.35)',
    };
  }

  if (answerLocked) {
    return {
      background: 'rgba(255,255,255,0.05)',
      border: '1.5px solid rgba(255,255,255,0.1)',
      color: 'rgba(255,255,255,0.5)',
    };
  }

  return {
    background: 'rgba(255,255,255,0.06)',
    border: '1.5px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.85)',
  };
}
