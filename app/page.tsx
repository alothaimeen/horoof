'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const HexBackground = dynamic(() => Promise.resolve(HexBackgroundInner), { ssr: false });

// شبكة خلايا سداسية للخلفية
const HEX_LETTERS = ['أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

function HexBackgroundInner() {
  // شبكة 8 أعمدة × 6 صفوف من الخلايا السداسية
  const cols = 9;
  const rows = 7;
  const hexSize = 52; // px
  const hexW = hexSize * 2;
  const hexH = Math.sqrt(3) * hexSize;
  const totalW = cols * hexW * 0.75 + hexW * 0.25;
  const totalH = rows * hexH + hexH * 0.5;

  const cells: { x: number; y: number; letter: string; color: string; idx: number }[] = [];
  let idx = 0;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const x = col * hexW * 0.75 + hexSize;
      const y = row * hexH + (col % 2 === 1 ? hexH * 0.5 : 0) + hexH * 0.5;
      const letter = HEX_LETTERS[idx % HEX_LETTERS.length];
      // تلوين متناوب: أحمر أو أخضر للحواف، كحلي للمنتصف
      const isEdge = col === 0 || col === cols - 1 || row === 0 || row === rows - 1;
      const colorIndex = (col + row) % 3;
      let color = 'rgba(14,21,38,0.7)'; // كحلي
      if (isEdge) {
        color = (col + row) % 2 === 0 ? 'rgba(180,30,30,0.35)' : 'rgba(0,100,50,0.35)';
      } else if (colorIndex === 1) {
        color = 'rgba(180,30,30,0.12)';
      } else if (colorIndex === 2) {
        color = 'rgba(0,100,50,0.12)';
      }
      cells.push({ x, y, letter, color, idx });
      idx++;
    }
  }

  function hexPoints(cx: number, cy: number, r: number) {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');
  }

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${totalW} ${totalH}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ opacity: 0.6 }}
      >
        {cells.map(({ x, y, letter, color, idx: i }) => (
          <g key={i}>
            <polygon
              points={hexPoints(x, y, hexSize - 2)}
              fill={color}
              stroke="rgba(201,162,39,0.15)"
              strokeWidth="1.5"
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={hexSize * 0.42}
              fontFamily="Cairo, sans-serif"
              fontWeight="900"
              fill="rgba(201,162,39,0.18)"
            >
              {letter}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinCodeFromUrl = searchParams.get('join');

  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'home' | 'join'>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (joinCodeFromUrl) { setJoinCode(joinCodeFromUrl); setMode('join'); }
  }, [joinCodeFromUrl]);

  useEffect(() => {
    const saved = localStorage.getItem('playerName');
    if (saved) setPlayerName(saved);
  }, []);

  async function handleCreate() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: 'كابتن' }),
      });
      if (!res.ok) throw new Error();
      const { code } = await res.json();
      localStorage.removeItem('playerId');
      localStorage.setItem('playerName', 'الكابتن');
      router.push(`/room/${code}`);
    } catch {
      setError('حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!playerName.trim()) { setError('أدخل اسمك أولاً'); return; }
    const code = joinCode || joinCodeFromUrl || '';
    if (code.length !== 4) { setError('الكود يجب أن يكون 4 أرقام'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/rooms/${code}`);
      if (!res.ok) throw new Error();
      localStorage.setItem('playerName', playerName.trim());
      localStorage.removeItem('playerId');
      router.push(`/room/${code}`);
    } catch {
      setError('الكود غير صحيح أو الغرفة غير موجودة');
    } finally {
      setLoading(false);
    }
  }

  // ─── وضع الانضمام ────────────────────────────────────────────
  if (joinCodeFromUrl || mode === 'join') {
    return (
      <>
        <HexBackground />
        <main className="relative z-10 min-h-dvh flex flex-col items-center justify-center px-4 py-8">

          {/* شعار مصغر */}
          <div className="text-center mb-8 animate-fade-in">
            <h1
              className="huroof-logo text-5xl font-black mb-1 animate-[logoGlow_3s_ease-in-out_infinite]"
              style={{ fontFamily: 'var(--font-cairo)' }}
            >
              حروف
            </h1>
            <p className="text-eid-sand/50 text-sm tracking-widest">انضم إلى الجلسة</p>
            {joinCodeFromUrl && (
              <p className="text-eid-sand/40 text-xs mt-1">
                غرفة رقم{' '}
                <span
                  className="led-display text-base"
                  style={{ color: '#C9A227', borderColor: '#C9A227' }}
                >
                  {joinCodeFromUrl}
                </span>
              </p>
            )}
          </div>

          <div className="card w-full max-w-sm animate-slide-up space-y-4">
            <div>
              <label className="block text-eid-sand/70 mb-2 text-sm font-semibold tracking-wide">اسمك في المسابقة</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="مثال: أبو عبدالله"
                maxLength={20}
                autoFocus
                className="w-full p-4 rounded-xl text-right text-lg bg-huroof-navy border-2 border-eid-gold/30 text-eid-sand placeholder-eid-sand/30 focus:outline-none focus:border-eid-gold transition-all"
                style={{ background: 'rgba(6,10,23,0.9)' }}
              />
            </div>

            {!joinCodeFromUrl && (
              <div>
                <label className="block text-eid-sand/70 mb-2 text-sm font-semibold tracking-wide">كود الغرفة</label>
                <input
                  type="number"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.slice(0, 4))}
                  placeholder="0000"
                  className="w-full p-4 rounded-xl text-center text-3xl font-black border-2 border-eid-gold/30 text-eid-gold placeholder-eid-sand/20 focus:outline-none focus:border-eid-gold tracking-[0.4em]"
                  style={{
                    background: 'rgba(6,10,23,0.95)',
                    fontFamily: 'Courier New, monospace',
                    textShadow: joinCode ? '0 0 10px rgba(201,162,39,0.5)' : 'none',
                  }}
                />
              </div>
            )}

            <button onClick={handleJoin} disabled={loading} className="btn-primary">
              {loading ? '⏳ جاري الانضمام...' : 'انضم الآن'}
            </button>

            {!joinCodeFromUrl && (
              <button
                onClick={() => { setMode('home'); setError(''); setJoinCode(''); }}
                className="w-full text-eid-sand/50 py-2 hover:text-eid-gold transition-colors text-sm"
              >
                ← رجوع
              </button>
            )}

            {error && (
              <p className="text-huroof-red text-center text-sm font-semibold"
                style={{ textShadow: '0 0 8px rgba(255,44,44,0.5)' }}>
                ⚠ {error}
              </p>
            )}
          </div>
        </main>
      </>
    );
  }

  // ─── الصفحة الرئيسية ─────────────────────────────────────────
  return (
    <>
      <HexBackground />
      <main className="relative z-10 min-h-dvh flex flex-col items-center justify-center px-4 py-8">

        {/* شعار حروف */}
        <div className="text-center mb-10 animate-fade-in">
          {/* إطار الشعار */}
          <div
            className="inline-block mb-4 px-6 py-2 rounded-2xl"
            style={{
              border: '2px solid rgba(201,162,39,0.4)',
              background: 'rgba(6,10,23,0.75)',
              boxShadow: '0 0 40px rgba(201,162,39,0.2), inset 0 0 20px rgba(201,162,39,0.05)',
            }}
          >
            <h1
              className="huroof-logo font-black animate-[logoGlow_3s_ease-in-out_infinite]"
              style={{ fontSize: '5rem', letterSpacing: '0.15em', lineHeight: 1.1 }}
            >
              حروف
            </h1>
          </div>
          {/* شريط ذهبي */}
          <div
            className="mx-auto mb-3"
            style={{
              height: '2px',
              width: '180px',
              background: 'linear-gradient(90deg, transparent, #C9A227, transparent)',
              boxShadow: '0 0 10px rgba(201,162,39,0.5)',
            }}
          />
          <p className="text-eid-sand/60 text-base tracking-[0.3em] uppercase">مسابقة الحروف العربية</p>
        </div>

        <div className="card w-full max-w-sm animate-slide-up">
          <div className="space-y-3">
            <button onClick={handleCreate} disabled={loading} className="btn-primary">
              {loading ? '⏳ جاري التحضير...' : '▶  بدء اللعبة'}
            </button>
            <button
              onClick={() => { setMode('join'); setError(''); }}
              className="w-full py-4 px-6 rounded-xl text-lg font-bold border-2 border-eid-gold/40 text-eid-gold hover:bg-eid-gold/10 hover:border-eid-gold transition-all"
              style={{ background: 'rgba(6,10,23,0.7)' }}
            >
              الانضمام بكود
            </button>
          </div>

          {error && (
            <p className="text-huroof-red text-center mt-4 text-sm font-semibold"
              style={{ textShadow: '0 0 8px rgba(255,44,44,0.5)' }}>
              ⚠ {error}
            </p>
          )}
        </div>

        <p className="relative z-10 text-eid-sand/20 text-xs mt-10 tracking-widest">حروف ©</p>
      </main>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <main className="min-h-dvh flex items-center justify-center">
        <div
          className="huroof-logo text-6xl font-black animate-pulse"
          style={{ fontFamily: 'var(--font-cairo)' }}
        >
          حروف
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
