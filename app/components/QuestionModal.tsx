'use client';

import React, { useEffect, useState } from 'react';
import type { TeamColor } from '../../lib/hexUtils';

type ModalPhase =
  | 'CELL_SELECTION'
  | 'BUZZER'
  | 'BUZZER_SECOND_CHANCE'
  | 'ANSWERING'
  | 'ANSWER_REVEAL'
  | 'ROUND_OVER'
  | 'GAME_OVER'
  | 'DAIRAT_AL_DAW';

interface QuestionModalProps {
  letter: string;
  text: string;
  options: string[];
  endTime: number;             // timestamp from server (Date.now() + 30s), 0 in BUZZER phase
  currentTeam: TeamColor;
  myTeam: TeamColor | null;    // null for host
  isHost: boolean;
  answerLocked: boolean;       // true after someone answered correctly
  correctIndex: number | null; // revealed after lock or timeout
  phase: ModalPhase;
  buzzerTeam: TeamColor | null; // which team buzzed in (null if no one yet)
  mayBuzz: boolean;            // can this player's team press the buzzer?
  onAnswer: (index: number) => void;
  onBuzzIn: () => void;
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
  phase,
  buzzerTeam,
  mayBuzz,
  onAnswer,
  onBuzzIn,
}: QuestionModalProps) {
  const [timeLeft, setTimeLeft] = useState(() => endTime > 0 ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [buzzPressed, setBuzzPressed] = useState(false);

  const isBuzzerPhase = phase === 'BUZZER' || phase === 'BUZZER_SECOND_CHANCE';
  // Can answer: only in ANSWERING phase and only if you belong to the team that buzzed
  const canAnswer = phase === 'ANSWERING' && !isHost && myTeam === buzzerTeam && !answerLocked && selected === null;

  // Countdown timer — only active in ANSWERING phase
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
  }, [text]);

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

  const timerPercent = endTime > 0 ? Math.max(0, (timeLeft / 30) * 100) : 0;
  const timerColor = timeLeft <= 5 ? '#FF2C2C' : timeLeft <= 10 ? '#FFD700' : '#00FF7F';

  const isRedTeam = currentTeam === 'RED';
  const teamBorderColor = isRedTeam ? 'rgba(255,44,44,0.6)' : 'rgba(0,200,83,0.6)';
  const teamGlowColor = isRedTeam ? 'rgba(255,44,44,0.2)' : 'rgba(0,200,83,0.2)';
  const teamTextColor = isRedTeam ? '#FF4444' : '#00FF7F';
  const teamLabel = isRedTeam ? 'الفريق الأحمر' : 'الفريق الأخضر';

  const myTeamColor = myTeam === 'RED' ? '#FF4444' : '#00FF7F';
  const myTeamLabel = myTeam === 'RED' ? 'الأحمر' : 'الأخضر';
  const buzzerTeamLabel = buzzerTeam === 'RED' ? 'الأحمر' : buzzerTeam === 'GREEN' ? 'الأخضر' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
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

            {/* زر السرعة */}
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

            {/* بعد الضغط — انتظار الموافقة */}
            {!isHost && mayBuzz && buzzPressed && (
              <div
                className="text-center py-4 px-6 rounded-xl font-black text-lg"
                style={{ color: myTeamColor, background: `${myTeamColor}15`, border: `1px solid ${myTeamColor}40` }}
              >
                ⏳ في انتظار الخادم...
              </div>
            )}

            {/* فريق غير مؤهل للضغط أو الكابتن */}
            {(isHost || (!mayBuzz && !buzzPressed)) && (
              <div
                className="text-center py-3 px-5 rounded-xl text-sm font-bold"
                style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)' }}
              >
                {isHost ? '👁 الكابتن — مشاهدة' : buzzerTeam ? `🎯 الفريق ${buzzerTeamLabel} ينتظر للإجابة...` : '⏳ انتظر...'}
              </div>
            )}
          </div>
        )}

        {/* ─── طور ANSWERING ─── */}
        {phase === 'ANSWERING' && (
          <>
            {/* شريط المؤقت */}
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

            {/* الخيارات — للفريق الذي ضغط السرعة فقط */}
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
                      {['أ','ب','ج','د'][i]}.
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              /* فريق المشاهدين */
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

            {/* رسالة الحالة */}
            {answerLocked && (
              <p className="text-center text-sm font-black mt-4"
                style={{ color: '#69F0AE', textShadow: '0 0 8px rgba(0,255,127,0.5)' }}>
                ✓ تم تسجيل الإجابة الصحيحة!
              </p>
            )}
            {isHost && (
              <p className="text-center text-eid-sand/30 mt-3 text-xs tracking-wide">الكابتن — مشاهدة فقط</p>
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

