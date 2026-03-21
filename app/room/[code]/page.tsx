'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { QRCodeSVG } from 'qrcode.react';

interface PlayerInfo {
  id: string;
  name: string;
  isConnected: boolean;
  team: string | null;
  joinOrder?: number;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [myTeam, setMyTeam] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [error, setError] = useState('');

  // Fetch join URL
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    fetch(`${basePath}/api/local-ip`)
      .then(r => r.json())
      .then(({ appUrl }) => {
        // appUrl قد لا يحتوي على basePath — نضيفه إذا لزم
        const base = appUrl.endsWith(basePath) ? appUrl : `${appUrl}${basePath}`;
        setJoinUrl(`${base}?join=${code}`);
      })
      .catch(() => {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        setJoinUrl(`${window.location.origin}${basePath}?join=${code}`);
      });
  }, [code]);

  // Socket connection
  useEffect(() => {
    const socket = getSocket();
    const savedPlayerId = localStorage.getItem('playerId') ?? undefined;
    const playerName = localStorage.getItem('playerName') ?? `لاعب ${Math.floor(Math.random() * 100)}`;

    socket.on('room_joined', ({ playerId: pid, isHost: h, players: p, gameStatus }: {
      playerId: string; isHost: boolean; players: PlayerInfo[]; gameStatus: string;
    }) => {
      setPlayerId(pid);
      localStorage.setItem('playerId', pid);
      setIsHost(h);
      setPlayers(p);
      const me = p.find(pl => pl.id === pid);
      setMyTeam(me?.team ?? null);
      if (gameStatus === 'PLAYING') router.replace(`/play/${code}`);
    });

    socket.on('player_update', ({ players: p }: { players: PlayerInfo[] }) => {
      setPlayers(p);
      const me = p.find(pl => pl.id === localStorage.getItem('playerId'));
      if (me?.team) setMyTeam(me.team);
    });

    socket.on('teams_updated', ({ players: teamPlayers }: { players: PlayerInfo[] }) => {
      setPlayers(prev => {
        const teamMap = new Map(teamPlayers.map(p => [p.id, p]));
        return prev.map(p => {
          const tp = teamMap.get(p.id);
          return tp ? { ...p, team: tp.team, isConnected: tp.isConnected } : p;
        });
      });
      const me = teamPlayers.find(p => p.id === localStorage.getItem('playerId'));
      if (me) setMyTeam(me.team);
    });

    socket.on('host_changed', ({ newHostId }: { newHostId: string }) => {
      if (newHostId === localStorage.getItem('playerId')) setIsHost(true);
    });

    socket.on('game_start', () => router.push(`/play/${code}`));
    socket.on('error', ({ message }: { message: string }) => setError(message));

    socket.emit('join_room', { roomCode: code, playerName, savedPlayerId });

    return () => {
      socket.off('room_joined');
      socket.off('player_update');
      socket.off('teams_updated');
      socket.off('host_changed');
      socket.off('game_start');
      socket.off('error');
    };
  }, [code, router]);

  function handleSetTeam(team: 'RED' | 'GREEN') {
    getSocket().emit('set_team', { roomCode: code, team });
  }

  function handleStart() {
    getSocket().emit('start_game', { roomCode: code });
  }

  function handleCopy() {
    if (!joinUrl) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(joinUrl).then(() => {
        setCopyDone(true);
        setTimeout(() => setCopyDone(false), 2000);
      });
    } else {
      const el = document.createElement('textarea');
      el.value = joinUrl;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try { document.execCommand('copy'); setCopyDone(true); setTimeout(() => setCopyDone(false), 2000); } catch { /* ignore */ }
      document.body.removeChild(el);
    }
  }

  const nonHostPlayers = players.filter(p => p.id !== (isHost ? playerId : '__none__'));
  const redPlayers = players.filter(p => p.team === 'RED');
  const greenPlayers = players.filter(p => p.team === 'GREEN');
  const unassigned = players.filter(p => !p.team && !(isHost && p.id === playerId));
  const canStart = redPlayers.length >= 1 && greenPlayers.length >= 1;

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-4 max-w-md mx-auto">

      {/* شعار حروف مصغر */}
      <div className="w-full text-center mb-3 animate-fade-in">
        <span
          className="huroof-logo font-black text-3xl"
          style={{ letterSpacing: '0.2em' }}
        >
          حروف
        </span>
      </div>

      {/* كود الغرفة — شاشة LED */}
      <div className="text-center mb-4 animate-fade-in w-full">
        <p className="text-eid-sand/40 text-xs mb-2 tracking-widest uppercase">كود الغرفة</p>
        <div
          className="led-display inline-block text-5xl font-black tracking-[0.4em] px-6 py-2"
          style={{ color: '#C9A227', borderColor: '#C9A227', fontFamily: 'Courier New, monospace' }}
        >
          {code}
        </div>
      </div>

      {/* QR Code + رابط */}
      <div className="card mb-4 flex flex-col items-center gap-2 w-full animate-slide-up py-4">
        <p className="text-eid-sand/40 text-xs tracking-widest mb-1">امسح للانضمام</p>
        <div
          className="p-2 rounded-xl"
          style={{ background: 'white', boxShadow: '0 0 20px rgba(201,162,39,0.3)' }}
        >
          {joinUrl
            ? <QRCodeSVG value={joinUrl} size={130} />
            : <div className="w-[130px] h-[130px] bg-gray-200 rounded animate-pulse" />
          }
        </div>
        <button
          onClick={handleCopy}
          className="text-eid-gold text-sm hover:text-eid-gold-light transition-colors font-semibold"
          style={{ textShadow: '0 0 8px rgba(201,162,39,0.3)' }}
        >
          {copyDone ? '✓ تم النسخ!' : 'نسخ الرابط'}
        </button>
      </div>

      {/* مؤشر الكابتن */}
      {isHost && (
        <div className="w-full text-center mb-3">
          <span
            className="text-sm font-bold"
            style={{ color: '#C9A227', textShadow: '0 0 10px rgba(201,162,39,0.5)' }}
          >
            ★ أنت الكابتن — مدير اللعبة
          </span>
        </div>
      )}

      {/* اختيار الفرق */}
      <div className="w-full mb-4">
        <h2
          className="font-black text-center mb-3 text-sm tracking-widest uppercase"
          style={{ color: '#C9A227' }}
        >
          — اختاروا الفرق —
        </h2>
        <div className="flex gap-3 w-full">

          {/* الفريق الأحمر */}
          <div
            className="flex-1 rounded-xl p-3 card card-neon-red"
          >
            <div className="text-center mb-2">
              <span
                className="font-black text-base"
                style={{ color: '#FF4444', textShadow: '0 0 10px rgba(255,44,44,0.7)' }}
              >
                ● الأحمر
              </span>
              <span className="text-red-500/50 text-xs block">→ يمين ← يسار</span>
            </div>
            <ul className="space-y-1 min-h-[56px]">
              {redPlayers.map(p => (
                <li key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm"
                  style={{ background: 'rgba(255,44,44,0.08)' }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                  <span className="text-red-200 truncate">{p.name}</span>
                  {p.id === playerId && <span className="text-xs" style={{ color: '#FF8A80' }}>(أنت)</span>}
                </li>
              ))}
              {redPlayers.length === 0 && (
                <li className="text-red-900/70 text-xs text-center py-2">لا لاعبين بعد</li>
              )}
            </ul>
            {!isHost && myTeam !== 'RED' && (
              <button onClick={() => handleSetTeam('RED')} className="btn-red w-full mt-2 text-sm py-2">
                {myTeam === 'GREEN' ? 'انتقل للأحمر' : 'انضم للأحمر'}
              </button>
            )}
            {!isHost && myTeam === 'RED' && (
              <div className="text-center mt-2 text-xs font-black" style={{ color: '#FF4444' }}>✓ فريقك</div>
            )}
          </div>

          {/* الفريق الأخضر */}
          <div
            className="flex-1 rounded-xl p-3 card card-neon-green"
          >
            <div className="text-center mb-2">
              <span
                className="font-black text-base"
                style={{ color: '#00FF7F', textShadow: '0 0 10px rgba(0,255,127,0.7)' }}
              >
                ● الأخضر
              </span>
              <span className="text-green-500/50 text-xs block">↓ أعلى → أسفل</span>
            </div>
            <ul className="space-y-1 min-h-[56px]">
              {greenPlayers.map(p => (
                <li key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm"
                  style={{ background: 'rgba(0,200,83,0.08)' }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                  <span className="text-green-200 truncate">{p.name}</span>
                  {p.id === playerId && <span className="text-xs" style={{ color: '#69F0AE' }}>(أنت)</span>}
                </li>
              ))}
              {greenPlayers.length === 0 && (
                <li className="text-green-900/70 text-xs text-center py-2">لا لاعبين بعد</li>
              )}
            </ul>
            {!isHost && myTeam !== 'GREEN' && (
              <button onClick={() => handleSetTeam('GREEN')} className="btn-green w-full mt-2 text-sm py-2">
                {myTeam === 'RED' ? 'انتقل للأخضر' : 'انضم للأخضر'}
              </button>
            )}
            {!isHost && myTeam === 'GREEN' && (
              <div className="text-center mt-2 text-xs font-black" style={{ color: '#00FF7F' }}>✓ فريقك</div>
            )}
          </div>
        </div>
      </div>

      {/* لاعبون بلا فريق */}
      {unassigned.length > 0 && (
        <div className="card w-full mb-4 py-3">
          <h3 className="text-eid-sand/40 text-xs mb-2 tracking-wider">بدون فريق ({unassigned.length})</h3>
          <ul className="space-y-1">
            {unassigned.map(p => (
              <li key={p.id} className="flex items-center gap-2 text-sm text-eid-sand/50">
                <span className={`w-1.5 h-1.5 rounded-full ${p.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                {p.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-sm mb-3 font-semibold text-center"
          style={{ color: '#FF4444', textShadow: '0 0 8px rgba(255,44,44,0.4)' }}>
          ⚠ {error}
        </p>
      )}

      {/* زر البدء / رسالة الانتظار */}
      {isHost ? (
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="btn-primary w-full max-w-sm animate-bounce-in"
        >
          {!canStart
            ? 'انتظر: لاعب واحد على الأقل في كل فريق'
            : `▷ ابدأ المسابقة! (${redPlayers.length} vs ${greenPlayers.length})`}
        </button>
      ) : !myTeam ? (
        <div className="card w-full text-center">
          <p className="text-eid-sand/60 font-semibold">اختر فريقك أولاً</p>
        </div>
      ) : (
        <div className="card w-full text-center">
          <p className="text-eid-sand/50 text-sm">في انتظار الكابتن ليبدأ اللعبة...</p>
        </div>
      )}
    </main>
  );
}
