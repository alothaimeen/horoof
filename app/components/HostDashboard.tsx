'use client';

import React, { useState } from 'react';
import { getSocket } from '@/lib/socket';
import type { TeamColor } from '@/lib/hexUtils';

type GamePhase =
  | 'CELL_SELECTION' | 'BUZZER' | 'BUZZER_SECOND_CHANCE' | 'BUZZER_OPEN'
  | 'ANSWERING' | 'ANSWER_REVEAL' | 'ROUND_OVER' | 'GAME_OVER' | 'DAIRAT_AL_DAW';

interface PlayerInfo {
  id: string;
  name: string;
  isConnected: boolean;
  team: TeamColor | null;
  status: 'active' | 'away';
}

interface HostDashboardProps {
  roomCode: string;
  phase: string;
  isPaused: boolean;
  players: PlayerInfo[];
  roundWins: Record<TeamColor, number>;
  hasActiveQuestion: boolean;
}

export function HostDashboard({
  roomCode,
  phase,
  isPaused,
  players,
  roundWins,
  hasActiveQuestion,
}: HostDashboardProps) {
  const [showDrawer, setShowDrawer] = useState(false);

  function emit(event: string, data?: object) {
    getSocket().emit(event, { roomCode, ...data });
  }

  const isTimedPhase = phase === 'ANSWERING' || phase === 'BUZZER_OPEN' || phase === 'BUZZER' || phase === 'BUZZER_SECOND_CHANCE';
  const canPause = isTimedPhase || isPaused;
  const canSkip = hasActiveQuestion && phase !== 'CELL_SELECTION' && phase !== 'GAME_OVER' && phase !== 'ROUND_OVER' && phase !== 'DAIRAT_AL_DAW';
  const canUndoBuzz = phase === 'ANSWERING';

  const activePlayers = players.filter(p => p.team !== null);
  const awayCount = activePlayers.filter(p => p.status === 'away').length;

  return (
    <>
      {/* ─── Fixed bottom host bar ─── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 pb-safe"
        style={{
          background: 'rgba(4,8,18,0.98)',
          borderTop: '1px solid rgba(201,162,39,0.25)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.6)',
        }}
        dir="rtl"
      >
        {/* Score editor */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => emit('host_adjust_score', { team: 'RED', delta: -1 })}
              className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center"
              style={{ background: 'rgba(255,44,44,0.1)', color: '#FF6666', border: '1px solid rgba(255,44,44,0.25)' }}
            >−</button>
            <span className="text-base font-black tabular-nums" style={{ color: '#FF4444', minWidth: '1.2rem', textAlign: 'center' }}>{roundWins.RED}</span>
            <button
              onClick={() => emit('host_adjust_score', { team: 'RED', delta: 1 })}
              className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center"
              style={{ background: 'rgba(255,44,44,0.1)', color: '#FF6666', border: '1px solid rgba(255,44,44,0.25)' }}
            >+</button>
            <span className="text-xs font-bold mr-1" style={{ color: 'rgba(255,44,44,0.6)' }}>أحمر</span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-xs font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>المقدم</span>
            {isPaused && (
              <span className="text-xs font-black animate-pulse" style={{ color: '#FFD700' }}>⏸ متوقف</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold ml-1" style={{ color: 'rgba(0,200,83,0.6)' }}>أخضر</span>
            <button
              onClick={() => emit('host_adjust_score', { team: 'GREEN', delta: -1 })}
              className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center"
              style={{ background: 'rgba(0,200,83,0.1)', color: '#00FF7F', border: '1px solid rgba(0,200,83,0.2)' }}
            >−</button>
            <span className="text-base font-black tabular-nums" style={{ color: '#00FF7F', minWidth: '1.2rem', textAlign: 'center' }}>{roundWins.GREEN}</span>
            <button
              onClick={() => emit('host_adjust_score', { team: 'GREEN', delta: 1 })}
              className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center"
              style={{ background: 'rgba(0,200,83,0.1)', color: '#00FF7F', border: '1px solid rgba(0,200,83,0.2)' }}
            >+</button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <button
            onClick={() => emit(isPaused ? 'host_resume' : 'host_pause')}
            disabled={!canPause}
            className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
            style={{
              background: isPaused ? 'rgba(255,200,0,0.12)' : canPause ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
              border: isPaused ? '1px solid rgba(255,200,0,0.5)' : '1px solid rgba(255,255,255,0.08)',
              color: isPaused ? '#FFD700' : canPause ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
              opacity: !canPause ? 0.4 : 1,
            }}
          >
            {isPaused ? '▶ استئناف' : '⏸ إيقاف'}
          </button>

          <button
            onClick={() => canUndoBuzz && emit('host_undo_buzz')}
            disabled={!canUndoBuzz}
            className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
            style={{
              background: canUndoBuzz ? 'rgba(255,165,0,0.08)' : 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,165,0,0.15)',
              color: canUndoBuzz ? '#FFA500' : 'rgba(255,255,255,0.2)',
              opacity: canUndoBuzz ? 1 : 0.4,
            }}
          >
            ↩ ألغِ الزر
          </button>

          <button
            onClick={() => canSkip && emit('host_skip_cell')}
            disabled={!canSkip}
            className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
            style={{
              background: canSkip ? 'rgba(255,44,44,0.08)' : 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,44,44,0.15)',
              color: canSkip ? '#FF6666' : 'rgba(255,255,255,0.2)',
              opacity: canSkip ? 1 : 0.4,
            }}
          >
            ⏭ تخطَّ
          </button>

          <button
            onClick={() => setShowDrawer(true)}
            className="relative py-2.5 px-3.5 rounded-xl text-sm font-black"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: awayCount > 0 ? '#FF9800' : 'rgba(255,255,255,0.5)',
            }}
          >
            👥
            {awayCount > 0 && (
              <span
                className="absolute -top-1 -left-1 w-4 h-4 rounded-full text-xs font-black flex items-center justify-center"
                style={{ background: '#FF9800', color: '#000' }}
              >{awayCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* ─── Players Drawer ─── */}
      {showDrawer && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDrawer(false); }}
        >
          <div
            className="w-full rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto"
            style={{ background: 'rgba(5,9,20,0.99)', border: '1px solid rgba(201,162,39,0.18)', boxShadow: '0 -8px 32px rgba(0,0,0,0.7)' }}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black" style={{ color: '#C9A227' }}>إدارة اللاعبين</h3>
              <button
                onClick={() => setShowDrawer(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
              >✕</button>
            </div>

            {activePlayers.length === 0 && (
              <p className="text-center text-sm py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>لا يوجد لاعبون</p>
            )}

            <div className="space-y-2">
              {activePlayers.map(p => {
                const teamColor = p.team === 'RED' ? '#FF4444' : '#00FF7F';
                const isAway = p.status === 'away';
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: p.isConnected ? '#00FF88' : '#444' }}
                    />
                    <span
                      className="flex-1 text-sm font-semibold truncate"
                      style={{ color: isAway ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)' }}
                    >
                      {p.name}
                    </span>
                    <span className="text-xs font-bold" style={{ color: teamColor }}>
                      {p.team === 'RED' ? 'أحمر' : 'أخضر'}
                    </span>

                    <button
                      onClick={() => emit('host_toggle_away_mode', { targetPlayerId: p.id })}
                      className="text-xs px-2 py-1 rounded-lg font-black"
                      style={{
                        background: isAway ? 'rgba(0,200,83,0.08)' : 'rgba(255,152,0,0.08)',
                        border: isAway ? '1px solid rgba(0,200,83,0.3)' : '1px solid rgba(255,152,0,0.25)',
                        color: isAway ? '#00FF88' : '#FF9800',
                      }}
                    >
                      {isAway ? '↩ حاضر' : '🔕 غياب'}
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(`طرد ${p.name} من اللعبة؟`)) {
                          emit('host_kick_player', { targetPlayerId: p.id });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded-lg font-black"
                      style={{
                        background: 'rgba(255,44,44,0.06)',
                        border: '1px solid rgba(255,44,44,0.18)',
                        color: '#FF4444',
                      }}
                    >✕</button>
                  </div>
                );
              })}
            </div>

            {/* All-away warning */}
            {(['RED', 'GREEN'] as TeamColor[]).map(team => {
              const teamPlayers = activePlayers.filter(p => p.team === team);
              const allAway = teamPlayers.length > 0 && teamPlayers.every(p => p.status === 'away');
              if (!allAway) return null;
              const label = team === 'RED' ? 'الأحمر' : 'الأخضر';
              const color = team === 'RED' ? '#FF4444' : '#00FF7F';
              return (
                <div key={team} className="mt-3 px-3 py-2 rounded-xl text-xs font-bold text-center"
                  style={{ background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.3)', color: '#FF9800' }}>
                  ⚠️ جميع لاعبي الفريق {label} في وضع الغياب
                </div>
              );
            })}

            <p className="text-xs mt-4 text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
              اضغط طويلاً على أي خلية في الشبكة لتعيينها يدوياً
            </p>
          </div>
        </div>
      )}
    </>
  );
}
