'use client';

import React, { useEffect, useState } from 'react';
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
  | 'DAIRAT_AL_DAW';

interface QuestionModalProps {
  letter: string;
  text: string;
  options: string[];
  endTime: number;              // timestamp from server, 0 in BUZZER phase
  timerMaxSec: number;          // max seconds for the current timer (10 for ANSWERING, 30 for BUZZER_OPEN)
  currentTeam: TeamColor;
  myTeam: TeamColor | null;     // null for host
  isHost: boolean;
  answerLocked: boolean;        // true after someone answered correctly
  correctIndex: number | null;  // revealed after lock or timeout
  phase: ModalPhase;
  buzzerTeam: TeamColor | null; // which team buzzed in (null if no one yet)
  openAnswerTeam: TeamColor | null; // team that can directly answer in BUZZER_OPEN
  openRevealStartTime: number | null; // timestamp when BUZZER_OPEN reveal phase started
  mayBuzz: boolean;             // can this player's team press the buzzer?
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
  mayBuzz,
  onAnswer,
  onBuzzIn,
}: QuestionModalProps) {
  const [timeLeft, setTimeLeft] = useState(() => endTime > 0 ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [buzzPressed, setBuzzPressed] = useState(false);
  // Reveal count for BUZZER_OPEN gradual option display
  const [revealedCount, setRevealedCount] = useState<number>(() =>
    isOpenPhase && openRevealStartTime !== null ? 0 : options.length
  );

  const isBuzzerPhase = phase === 'BUZZER' || phase === 'BUZZER_SECOND_CHANCE';
  const isOpenPhase = phase === 'BUZZER_OPEN';

  // Can answer: ANSWERING (only buzzer team) or BUZZER_OPEN (only open answer team)
  const canAnswer = (
    (phase === 'ANSWERING' && !isHost && myTeam === buzzerTeam && !answerLocked && selected === null) ||
    (isOpenPhase && !isHost && myTeam === openAnswerTeam && !answerLocked && selected === null)
  );

  // Countdown timer — active in ANSWERING and BUZZER_OPEN
  useEffect(() => {
    if (!endTime || endTime === 0 || isBuzzerPhase) {
      setTimeLeft(0);
      return;
    }
    setTimeLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [endTime, isBuzzerPhase]);

  // Reset selection when a new question arrives (text changes)
  useEffect(() => {
    setSelected(null);
    setBuzzPressed(false);
    setRevealedCount(0);
  }, [text]);

  // Reset selection when phase changes to BUZZER_OPEN
  useEffect(() => {
    if (isOpenPhase) setSelected(null);
  }, [isOpenPhase]);

  // Gradual reveal effect for BUZZER_OPEN options
  useEffect(() => {
    if (!isOpenPhase || openRevealStartTime === null) {
      setRevealedCount(options.length);
      return;
    }
    const updateReveal = () => {
      const elapsed = Date.now() - openRevealStartTime;
      const count = elapsed < 2000 ? 0
        : elapsed < 3000 ? 1
        : elapsed < 4000 ? 2
        : elapsed < 5000 ? 3
        : options.length;
      setRevealedCount(count);
      return count;
    };
    const initial = updateReveal();
    if (initial >= options.length) return;
    const interval = setInterval(() => {
      const c = updateReveal();
      if (c >= options.length) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [isOpenPhase, openRevealStartTime, options.length]);

  const handleAnswer = (index: number) => {
    if (!canAnswer) return;
    setSelected(index);
    onAnswer(index);
  };

  const handleBuzz = () => {
    if (buzzPressed || !mayBuzz) return;
    setBuzzPressed(true);
    onBuzzIn();
  };

  // Timer percent uses timerMaxSec as denominator
  const timerPercent = endTime > 0 ? Math.max(0, (timeLeft / timerMaxSec) * 100) : 0;

  // Color: red/tense for ANSWERING (10s), green/calm for BUZZER_OPEN (30s)
  const timerColor = isOpenPhase
    ? (timeLeft <= 8 ? '#FFD700' : '#00FF7F')
    : (timeLeft <= 3 ? '#FF2C2C' : timeLeft <= 6 ? '#FF8C00' : '#FF4444');

  const isRedTeam = currentTeam === 'RED';
  const teamBorderColor = isRedTeam ? 'rgba(255,44,44,0.6)' : 'rgba(0,200,83,0.6)';
  const teamGlowColor = isRedTeam ? 'rgba(255,44,44,0.2)' : 'rgba(0,200,83,0.2)';
  const teamTextColor = isRedTeam ? '#FF4444' : '#00FF7F';
  const teamLabel = isRedTeam ? 'الفريق الأحمر' : 'الفريق الأخضر';

  const myTeamColor = myTeam === 'RED' ? '#FF4444' : '#00FF7F';
  const buzzerTeamLabel = buzzerTeam === 'RED' ? 'الأحمر' : buzzerTeam === 'GREEN' ? 'الأخضر' : '';
  const openTeamLabel = openAnswerTeam === 'RED' ? 'الأحمر' : openAnswerTeam === 'GREEN' ? 'الأخضر' : '';
  const openTeamColor = openAnswerTeam === 'RED' ? '#FF4444' : '#00FF7F';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5"
        dir="rtl"
        style={{
          background: 'rgba(6,10,23,0.97)',
          border: `2px solid ${isOpenPhase ? 'rgba(0,255,127,0.5)' : teamBorderColor}`,
          boxShadow: `0 -10px 40px ${isOpenPhase ? 'rgba(0,255,127,0.15)' : teamGlowColor}, 0 0 0 1px rgba(255,255,255,0.03)`,
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
            style={{ color: isOpenPhase ? '#00FF7F' : teamTextColor, textShadow: `0 0 8px ${isOpenPhase ? '#00FF7F' : teamTextColor}` }}
          >
            {isOpenPhase ? '⚡ وقت مفتوح' : `● ${teamLabel}`}
          </span>
        </div>

        {/* نص السؤال — دائماً مرئي */}
        <p
          className="text-lg font-semibold text-center mb-4 leading-relaxed"
          style={{ color: '#E8E8F0' }}
        >
          {text}
        </p>

        {/* ─── طور BUZZER / BUZZER_SECOND_CHANCE ─── */}
        {isBuzzerPhase && (
          <div className="flex flex-col items-center gap-4">
            {phase === 'BUZZER_SECOND_CHANCE' && (
              <p className="text-sm font-bold text-center" style={{ color: '#FFD700' }}>
                ⚡ فرصة الفريق الثاني!
              </p>
            )}

            {!isHost && mayBuzz && !buzzPressed && (
              <button
                onClick={handleBuzz}
                className="btn-buzzer"
                style={{
                  background: myTeam === 'RED'
                    ? 'linear-gradient(145deg, #ff5555, #cc0000)'
                    : 'linear-gradient(145deg, #00e676, #00701a)',
                  color: '#fff',
                  border: `2px solid ${myTeamColor}`,
                  boxShadow: `0 0 20px ${myTeamColor}80, 0 4px 0 rgba(0,0,0,0.4)`,
                }}
              >
                ⚡ أنا أعرف!
              </button>
            )}

            {!isHost && mayBuzz && buzzPressed && (
              <div
                className="text-center py-4 px-6 rounded-xl font-black text-lg"
                style={{ color: myTeamColor, background: `${myTeamColor}15`, border: `1px solid ${myTeamColor}40` }}
              >
                ⏳ في انتظار الخادم...
              </div>
            )}

            {(isHost || (!mayBuzz && !buzzPressed)) && (
              <div
                className="text-center py-3 px-5 rounded-xl text-sm font-bold"
                style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)' }}
              >
                {isHost ? '👁 المقدم — مشاهدة' : buzzerTeam ? `🎯 الفريق ${buzzerTeamLabel} ينتظر للإجابة...` : '⏳ انتظر...'}
              </div>
            )}
          </div>
        )}

        {/* ─── طور BUZZER_OPEN ─── */}
        {isOpenPhase && (() => {
          const effectiveRevealed = (correctIndex !== null || answerLocked) ? options.length : revealedCount;
          const allRevealed = effectiveRevealed >= options.length;
          return (
            <>
              {/* إعلان الوقت المفتوح */}
              <div
                className="text-center py-2 px-4 rounded-xl mb-3"
                style={{ background: 'rgba(0,255,127,0.06)', border: '1px solid rgba(0,255,127,0.2)' }}
              >
                <p className="text-sm font-black" style={{ color: '#00FF7F', textShadow: '0 0 8px rgba(0,255,127,0.5)' }}>
                  ⚡ وقت مفتوح! الفريق {buzzerTeamLabel} لم يجب
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  الفريق <span style={{ color: openTeamColor, fontWeight: 'bold' }}>{openTeamLabel}</span> — {allRevealed ? 'أجب الآن!' : 'تظهر الخيارات...'}
                </p>
              </div>

              {/* شريط المؤقت — يظهر فقط بعد اكتمال الخيارات */}
              {allRevealed && (
                <>
                  <div
                    className="h-2 rounded-full mb-2 overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <div
                      className="h-full rounded-full"
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
                </>
              )}

              {/* الخيارات بظهور تدريجي */}
              {(canAnswer || selected !== null || correctIndex !== null || !allRevealed) ? (
                <div className="grid grid-cols-1 gap-2">
                  {options.map((opt, i) => {
                    const isRevealed = i < effectiveRevealed;
                    return (
                      <div
                        key={i}
                        style={{
                          transition: 'opacity 0.35s ease, transform 0.35s ease',
                          opacity: isRevealed ? 1 : 0,
                          transform: isRevealed ? 'translateY(0)' : 'translateY(10px)',
                        }}
                      >
                        <button
                          onClick={() => isRevealed && handleAnswer(i)}
                          disabled={!canAnswer || !isRevealed}
                          className={getOptionStyle(i, selected, correctIndex, answerLocked, timeLeft, canAnswer && isRevealed)}
                        >
                          <span className="font-black ml-2 text-sm" style={{ color: '#C9A227' }}>
                            {['أ', 'ب', 'ج', 'د'][i]}.
                          </span>
                          {opt}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="text-center py-4 px-5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {isHost ? (
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>👁 المقدم — مشاهدة</p>
                  ) : (
                    <p className="font-black text-base" style={{ color: openTeamColor }}>
                      🎯 الفريق {openTeamLabel} يجيب الآن...
                    </p>
                  )}
                </div>
              )}

              {answerLocked && (
                <p className="text-center text-sm font-black mt-4"
                  style={{ color: '#69F0AE', textShadow: '0 0 8px rgba(0,255,127,0.5)' }}>
                  ✓ تم تسجيل الإجابة الصحيحة!
                </p>
              )}
            </>
          );
        })()}

        {/* ─── طور ANSWERING ─── */}
        {phase === 'ANSWERING' && (
          <>
            {/* شريط المؤقت — أحمر متوتر */}
            <div
              className="h-2 rounded-full mb-2 overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${timerPercent}%`,
                  background: `linear-gradient(90deg, ${timerColor}, ${timerColor}80)`,
                  boxShadow: `0 0 6px ${timerColor}${timeLeft <= 3 ? ', 0 0 12px ' + timerColor : ''}`,
                  transition: 'width 0.25s linear',
                }}
              />
            </div>
            <div
              className="text-center font-black mb-3"
              style={{
                fontSize: timeLeft <= 3 ? '2rem' : '1.5rem',
                color: timerColor,
                textShadow: `0 0 ${timeLeft <= 3 ? '16px' : '10px'} ${timerColor}`,
                fontFamily: 'Courier New, monospace',
                transition: 'font-size 0.2s, color 0.2s',
              }}
            >
              {timeLeft}
            </div>

            {canAnswer || (selected !== null) || (correctIndex !== null) ? (
              <div className="grid grid-cols-1 gap-2">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={!canAnswer}
                    className={getOptionStyle(i, selected, correctIndex, answerLocked, timeLeft, canAnswer)}
                  >
                    <span className="font-black ml-2 text-sm" style={{ color: '#C9A227' }}>
                      {['أ', 'ب', 'ج', 'د'][i]}.
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div
                className="text-center py-4 px-5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {buzzerTeam ? (
                  <p className="font-black text-base" style={{ color: buzzerTeam === 'RED' ? '#FF4444' : '#00FF7F' }}>
                    🎯 الفريق {buzzerTeamLabel} يجيب...
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>انتظر...</p>
                )}
              </div>
            )}

            {answerLocked && (
              <p className="text-center text-sm font-black mt-4"
                style={{ color: '#69F0AE', textShadow: '0 0 8px rgba(0,255,127,0.5)' }}>
                ✓ تم تسجيل الإجابة الصحيحة!
              </p>
            )}
            {isHost && (
              <p className="text-center text-eid-sand/30 mt-3 text-xs tracking-wide">المقدم — مشاهدة فقط</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getOptionStyle(
  i: number,
  selected: number | null,
  correctIndex: number | null,
  answerLocked: boolean,
  timeLeft: number,
  canAnswer: boolean
): string {
  if (correctIndex !== null && (answerLocked || timeLeft === 0)) {
    if (i === correctIndex) return 'option-btn correct';
    if (i === selected && i !== correctIndex) return 'option-btn wrong';
    return 'option-btn opacity-40 cursor-not-allowed';
  }
  if (i === selected) return 'option-btn selected';
  if (canAnswer) return 'option-btn cursor-pointer';
  return 'option-btn opacity-60 cursor-not-allowed';
}
