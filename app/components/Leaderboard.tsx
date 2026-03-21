'use client';

import React from 'react';
import type { TeamColor } from '../../lib/hexUtils';

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  team: TeamColor | null;
  correct: number;
  wrong: number;
  buzzes: number;
  goldenWins: number;
  avgTimeMs: number;
}

export interface LeaderboardData {
  players: LeaderboardEntry[];
  fastestPlayer: { name: string; avgTimeMs: number } | null;
}

interface LeaderboardProps {
  data: LeaderboardData;
}

function formatTime(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}ث`;
}

export function Leaderboard({ data }: LeaderboardProps) {
  const { players, fastestPlayer } = data;

  if (players.length === 0) {
    return (
      <div className="text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
        لا يوجد بيانات بعد
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full max-w-sm mx-auto">
      {/* Fastest player banner */}
      {fastestPlayer && (
        <div
          className="text-center py-2 px-4 rounded-xl mb-3"
          style={{
            background: 'rgba(201,162,39,0.12)',
            border: '1px solid rgba(201,162,39,0.4)',
          }}
        >
          <span className="font-black text-sm" style={{ color: '#FFD700', textShadow: '0 0 8px rgba(255,215,0,0.5)' }}>
            🏆 أسرع لاعب: {fastestPlayer.name}
          </span>
          <span className="text-xs mr-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            ({formatTime(fastestPlayer.avgTimeMs)} متوسط)
          </span>
        </div>
      )}

      {/* Table header */}
      <div
        className="grid text-xs font-black mb-1 px-2"
        style={{
          gridTemplateColumns: '1.5rem 1fr 2rem 2rem 2rem 3rem',
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.05em',
        }}
      >
        <span>#</span>
        <span>الاسم</span>
        <span className="text-center">✅</span>
        <span className="text-center">❌</span>
        <span className="text-center">⚡</span>
        <span className="text-center">⏱ متوسط</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1">
        {players.map((p) => {
          const teamColor = p.team === 'RED' ? '#FF4444' : p.team === 'GREEN' ? '#00FF7F' : '#888';
          const isTopThree = p.rank <= 3;
          const rankIcon = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}`;

          return (
            <div
              key={p.id}
              className="grid items-center px-2 py-2 rounded-xl"
              style={{
                gridTemplateColumns: '1.5rem 1fr 2rem 2rem 2rem 3rem',
                background: isTopThree
                  ? `${teamColor}10`
                  : 'rgba(255,255,255,0.03)',
                border: isTopThree
                  ? `1px solid ${teamColor}30`
                  : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {/* Rank */}
              <span className="text-sm font-black" style={{ color: isTopThree ? '#FFD700' : 'rgba(255,255,255,0.4)' }}>
                {rankIcon}
              </span>

              {/* Name + team dot */}
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: teamColor, boxShadow: `0 0 4px ${teamColor}` }}
                />
                <span
                  className="text-sm font-bold truncate"
                  style={{ color: '#E8E8F0' }}
                >
                  {p.name}
                  {p.goldenWins > 0 && (
                    <span className="mr-1" title="خلية ذهبية">✨</span>
                  )}
                </span>
              </div>

              {/* Correct */}
              <span className="text-center text-sm font-black" style={{ color: '#69F0AE' }}>
                {p.correct}
              </span>

              {/* Wrong */}
              <span className="text-center text-sm font-black" style={{ color: '#FF5555' }}>
                {p.wrong}
              </span>

              {/* Buzzes */}
              <span className="text-center text-sm font-black" style={{ color: '#FFD700' }}>
                {p.buzzes}
              </span>

              {/* Avg time */}
              <span className="text-center text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {formatTime(p.avgTimeMs)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
