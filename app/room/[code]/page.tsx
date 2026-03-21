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

    // Re-join on socket reconnect (server loses socket.data.playerId on disconnect)
    const rejoin = () => {
      socket.emit('join_room', {
        roomCode: code,
        playerName: localStorage.getItem('playerName') ?? playerName,
        savedPlayerId: localStorage.getItem('playerId') ?? savedPlayerId,
      });
    };
    socket.on('connect', rejoin);

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
      socket.off('connect', rejoin);
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

  const redPlayers = players.filter(p => p.team === 'RED');
  const greenPlayers = players.filter(p => p.team === 'GREEN');
  const unassigned = players.filter(p => !p.team && !(isHost && p.id === playerId));
  const canStart = redPlayers.length >= 1 && greenPlayers.length >= 1;
  const totalNonHost = players.filter(p => !(isHost && p.id === playerId)).length;

  // ══════════════════════════════════════════════════════════
  // واجهة المقدّم — لوحة التحكم
  // ══════════════════════════════════════════════════════════
  if (isHost) {
    return (
      <main className="min-h-dvh flex flex-col items-center px-4 py-4 max-w-lg mx-auto">

        {/* شعار + عنوان لوحة المقدم */}
        <div className="w-full text-center mb-3 animate-fade-in">
          <span className="huroof-logo font-black text-3xl" style={{ letterSpacing: '0.2em' }}>حروف</span>
          <div className="text-xs font-bold mt-1" style={{ color: '#C9A227', letterSpacing: '0.15em' }}>
            ★ لوحة المقدّم
          </div>
        </div>

        {/* كود الغرفة */}
        <div className="text-center mb-4 animate-fade-in w-full">
          <p className="text-eid-sand/40 text-xs mb-2 tracking-widest uppercase">كود الغرفة</p>
          <div
            className="led-display inline-block text-5xl font-black tracking-[0.4em] px-6 py-2"
            style={{ color: '#C9A227', borderColor: '#C9A227', fontFamily: 'Courier New, monospace' }}
          >
            {code}
          </div>
        </div>

        {/* دعوة المتسابقين — QR + رابط */}
        <div className="card mb-4 w-full animate-slide-up">
          <p className="text-eid-sand/60 text-xs font-bold mb-1 tracking-wider text-center">
            دعوة المتسابقين
          </p>
          <p className="text-eid-sand/35 text-xs text-center mb-3">
            اعرض الباركود على الشاشة، أو انسخ الرابط وأرسله للمتسابقين
          </p>
          <div className="flex flex-col items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'white', boxShadow: '0 0 20px rgba(201,162,39,0.3)' }}>
              {joinUrl
                ? <QRCodeSVG value={joinUrl} size={140} />
                : <div className="w-[140px] h-[140px] bg-gray-200 rounded animate-pulse" />
              }
            </div>
            {joinUrl && (
              <div className="w-full">
                <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 mb-2 overflow-hidden">
                  <span className="text-eid-sand/40 text-xs font-mono truncate flex-1">{joinUrl}</span>
                </div>
                <button onClick={handleCopy} className="btn-primary w-full text-sm py-2">
                  {copyDone ? '✓ تم النسخ! أرسله الآن للمتسابقين' : '⎘ انسخ الرابط وشاركه مع المتسابقين'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* إحصاء + الفرق */}
        <div className="w-full mb-3">
          <div className="flex justify-between items-center mb-3">
            <span className="font-black text-sm tracking-widest" style={{ color: '#C9A227' }}>— الفرق —</span>
            <span className="text-eid-sand/40 text-xs">{totalNonHost} منضم</span>
          </div>
          <div className="flex gap-3 w-full">

            {/* الفريق الأحمر */}
            <div className="flex-1 rounded-xl p-3 card card-neon-red">
              <div className="text-center mb-2">
                <span className="font-black text-base" style={{ color: '#FF4444', textShadow: '0 0 10px rgba(255,44,44,0.7)' }}>
                  ● الأحمر
                </span>
                <span className="text-red-500/50 text-xs block">({redPlayers.length} لاعب)</span>
              </div>
              <ul className="space-y-1 min-h-[48px]">
                {redPlayers.map(p => (
                  <li key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm"
                    style={{ background: 'rgba(255,44,44,0.08)' }}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className="text-red-200 truncate">{p.name}</span>
                  </li>
                ))}
                {redPlayers.length === 0 && (
                  <li className="text-red-900/60 text-xs text-center py-2">لا لاعبين بعد</li>
                )}
              </ul>
            </div>

            {/* الفريق الأخضر */}
            <div className="flex-1 rounded-xl p-3 card card-neon-green">
              <div className="text-center mb-2">
                <span className="font-black text-base" style={{ color: '#00FF7F', textShadow: '0 0 10px rgba(0,255,127,0.7)' }}>
                  ● الأخضر
                </span>
                <span className="text-green-500/50 text-xs block">({greenPlayers.length} لاعب)</span>
              </div>
              <ul className="space-y-1 min-h-[48px]">
                {greenPlayers.map(p => (
                  <li key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm"
                    style={{ background: 'rgba(0,200,83,0.08)' }}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className="text-green-200 truncate">{p.name}</span>
                  </li>
                ))}
                {greenPlayers.length === 0 && (
                  <li className="text-green-900/60 text-xs text-center py-2">لا لاعبين بعد</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* لاعبون بلا فريق */}
        {unassigned.length > 0 && (
          <div className="card w-full mb-3 py-3">
            <h3 className="text-eid-sand/40 text-xs mb-2 tracking-wider">
              ⏳ بدون فريق ({unassigned.length}) — في انتظار الاختيار
            </h3>
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

        {/* زر البدء */}
        <div className="w-full max-w-sm mt-1">
          {!canStart && (
            <p className="text-xs text-center text-eid-sand/35 mb-2">
              {redPlayers.length === 0 && greenPlayers.length === 0
                ? 'انتظر انضمام المتسابقين واختيار الفرق'
                : redPlayers.length === 0
                ? 'الفريق الأحمر فارغ — انتظر'
                : 'الفريق الأخضر فارغ — انتظر'}
            </p>
          )}
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="btn-primary w-full animate-bounce-in"
          >
            {canStart
              ? `▷ ابدأ المسابقة! (${redPlayers.length} vs ${greenPlayers.length})`
              : '⏳ في انتظار اكتمال الفرق...'}
          </button>
        </div>

      </main>
    );
  }

  // ══════════════════════════════════════════════════════════
  // واجهة المتسابق
  // ══════════════════════════════════════════════════════════
  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-6 max-w-md mx-auto">

      {/* شعار */}
      <div className="w-full text-center mb-4 animate-fade-in">
        <span className="huroof-logo font-black text-3xl" style={{ letterSpacing: '0.2em' }}>حروف</span>
      </div>

      {/* كود الغرفة */}
      <div className="text-center mb-6 animate-fade-in w-full">
        <p className="text-eid-sand/40 text-xs mb-2 tracking-widest uppercase">غرفة اللعب</p>
        <div
          className="led-display inline-block text-4xl font-black tracking-[0.4em] px-5 py-2"
          style={{ color: '#C9A227', borderColor: '#C9A227', fontFamily: 'Courier New, monospace' }}
        >
          {code}
        </div>
      </div>

      {/* اختيار الفريق */}
      {!myTeam ? (
        <div className="w-full mb-4 animate-slide-up">
          <h2 className="font-black text-center mb-1 text-base" style={{ color: '#C9A227' }}>
            اختر فريقك
          </h2>
          <p className="text-center text-eid-sand/40 text-xs mb-5">
            اختر الفريق الذي تريد اللعب معه
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => handleSetTeam('RED')}
              className="flex-1 py-6 rounded-2xl font-black text-lg transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,44,44,0.15)', border: '2px solid rgba(255,44,44,0.5)', color: '#FF6666', textShadow: '0 0 10px rgba(255,44,44,0.5)' }}
            >
              <div className="text-2xl mb-1">●</div>
              <div>الأحمر</div>
              <div className="text-xs font-normal opacity-60 mt-1">({redPlayers.length} لاعب)</div>
            </button>
            <button
              onClick={() => handleSetTeam('GREEN')}
              className="flex-1 py-6 rounded-2xl font-black text-lg transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(0,200,83,0.15)', border: '2px solid rgba(0,200,83,0.5)', color: '#00FF7F', textShadow: '0 0 10px rgba(0,200,83,0.5)' }}
            >
              <div className="text-2xl mb-1">●</div>
              <div>الأخضر</div>
              <div className="text-xs font-normal opacity-60 mt-1">({greenPlayers.length} لاعب)</div>
            </button>
          </div>
        </div>
      ) : (
        /* اختار فريقه — انتظار المقدم */
        <div className="w-full flex flex-col items-center gap-4 animate-slide-up">
          <div
            className={`w-full rounded-2xl p-5 text-center ${myTeam === 'RED' ? 'card card-neon-red' : 'card card-neon-green'}`}
          >
            <div className="text-4xl mb-2">{myTeam === 'RED' ? '🔴' : '🟢'}</div>
            <p className="font-black text-lg" style={{ color: myTeam === 'RED' ? '#FF4444' : '#00FF7F' }}>
              فريق {myTeam === 'RED' ? 'الأحمر' : 'الأخضر'}
            </p>
            <p className="text-eid-sand/40 text-xs mt-1">أنت في هذا الفريق</p>
          </div>
          <button
            onClick={() => handleSetTeam(myTeam === 'RED' ? 'GREEN' : 'RED')}
            className="text-xs text-eid-sand/30 hover:text-eid-sand/60 transition-colors"
          >
            تغيير الفريق
          </button>
        </div>
      )}

      {/* انتظار اللعبة */}
      {myTeam && (
        <div className="card w-full mt-4 text-center py-5">
          <div className="text-2xl mb-2 animate-pulse">⏳</div>
          <p className="text-eid-sand/60 font-semibold text-sm">في انتظار المقدم ليبدأ اللعبة...</p>
        </div>
      )}

      {/* زملاؤك في الفريق */}
      {myTeam && (myTeam === 'RED' ? redPlayers : greenPlayers).length > 1 && (
        <div className="w-full mt-3">
          <p className="text-eid-sand/30 text-xs mb-2 tracking-wider text-center">
            زملاؤك في الفريق ({(myTeam === 'RED' ? redPlayers : greenPlayers).length})
          </p>
          <ul className="space-y-1">
            {(myTeam === 'RED' ? redPlayers : greenPlayers).map(p => (
              <li key={p.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
                style={{ background: p.id === playerId ? 'rgba(201,162,39,0.08)' : 'transparent' }}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className="text-eid-sand/70 truncate">{p.name}</span>
                {p.id === playerId && <span className="text-xs text-eid-gold/60">(أنت)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-sm mt-3 font-semibold text-center" style={{ color: '#FF4444' }}>
          ⚠ {error}
        </p>
      )}

    </main>
  );
}
