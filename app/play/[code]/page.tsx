'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import type { HexCell as HexCellData, TeamColor } from '@/lib/hexUtils';
import { HexGrid } from '../../components/HexGrid';
import { QuestionModal } from '../../components/QuestionModal';
import { RoundTracker } from '../../components/RoundTracker';
import { DairataAlDaw } from '../../components/DairataAlDaw';
import { Leaderboard, type LeaderboardData } from '../../components/Leaderboard';
import { HostDashboard } from '../../components/HostDashboard';
import { SoundEngine } from '@/lib/soundEngine';

type GamePhase = 'CELL_SELECTION' | 'BUZZER' | 'BUZZER_SECOND_CHANCE' | 'BUZZER_OPEN' | 'ANSWERING' | 'ANSWER_REVEAL' | 'ROUND_OVER' | 'GAME_OVER' | 'DAIRAT_AL_DAW';
type PagePhase = 'loading' | GamePhase;

interface QuestionInfo {
  letter: string;
  text: string;
  options: string[];
  endTime: number;
  col: number;
  row: number;
}

interface DawClientState {
  winnerTeam: TeamColor;
  endTime: number;
  question: { text: string; options: string[]; index: number } | null;
  lastResult: boolean | null;
  score: number;
  total: number;
  isEnded: boolean;
  finalScore: { score: number; total: number } | null;
}

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  // --- State ---
  const [phase, setPhase] = useState<PagePhase>('loading');
  const [grid, setGrid] = useState<HexCellData[]>([]);
  const [currentTeam, setCurrentTeam] = useState<TeamColor>('RED');
  const [currentRound, setCurrentRound] = useState(1);
  const [roundWins, setRoundWins] = useState<Record<TeamColor, number>>({ RED: 0, GREEN: 0 });
  const [selectedCell, setSelectedCell] = useState<{ col: number; row: number } | null>(null);

  const [question, setQuestion] = useState<QuestionInfo | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [correctPlayerName, setCorrectPlayerName] = useState<string | null>(null);

  const [winningPath, setWinningPath] = useState<string[] | null>(null);
  const [gameWinner, setGameWinner] = useState<TeamColor | null>(null);
  const [roundWinner, setRoundWinner] = useState<TeamColor | null>(null);

  const [myTeam, setMyTeam] = useState<TeamColor | null>(null);
  const [isHost, setIsHost] = useState(false);
  const myIdRef = useRef('');
  const [buzzerTeam, setBuzzerTeam] = useState<TeamColor | null>(null);
  const [openAnswerTeam, setOpenAnswerTeam] = useState<TeamColor | null>(null);
  const [timerMaxSec, setTimerMaxSec] = useState(30);
  const [goldenCell, setGoldenCell] = useState<{ col: number; row: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [openRevealStartTime, setOpenRevealStartTime] = useState<number | null>(null);
  const [openNoAnswer, setOpenNoAnswer] = useState<{ correctIndex: number; currentTeam: TeamColor } | null>(null);
  const [players, setPlayers] = useState<Array<{ id: string; name: string; isConnected: boolean; team: TeamColor | null; status: 'active' | 'away' }>>([]);
  const openNoAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dawState, setDawState] = useState<DawClientState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Handlers (stable with useCallback) ---
  const handleCellClick = useCallback((col: number, row: number) => {
    SoundEngine.play('pop');
    SoundEngine.vibrate([50]);
    getSocket().emit('select_cell', { roomCode: code, col, row });
  }, [code]);

  const handleSubmitAnswer = useCallback((index: number) => {
    getSocket().emit('submit_answer', { roomCode: code, answerIndex: index });
  }, [code]);

  const handleBuzzIn = useCallback(() => {
    SoundEngine.play('buzz');
    SoundEngine.vibrate([100]);
    getSocket().emit('buzz_in', { roomCode: code });
  }, [code]);

  const handleNextRound = useCallback(() => {
    getSocket().emit('next_round', { roomCode: code });
  }, [code]);

  const handleStartDaw = useCallback(() => {
    getSocket().emit('start_daw', { roomCode: code });
  }, [code]);

  const handleDawJudge = useCallback((correct: boolean) => {
    getSocket().emit('daw_judge', { roomCode: code, correct });
  }, [code]);

  // --- Socket effect ---
  useEffect(() => {
    const socket = getSocket();
    const savedId = localStorage.getItem('playerId') ?? '';
    const name = localStorage.getItem('playerName') ?? 'لاعب';
    myIdRef.current = savedId;

    // Init sound on first interaction (browser policy)
    SoundEngine.init();
    const saved = localStorage.getItem('huroof_sound');
    setSoundEnabled(saved !== '0');

    // Re-join on socket reconnect (clears socket.data.playerId on server)
    const rejoin = () => {
      const latestId = localStorage.getItem('playerId') ?? savedId;
      const latestName = localStorage.getItem('playerName') ?? name;
      socket.emit('join_room', { roomCode: code, playerName: latestName, savedPlayerId: latestId });
    };
    socket.on('connect', rejoin);

    // Helper to reset question state
    const clearQuestion = () => {
      setQuestion(null);
      setSelectedCell(null);
      setCorrectIndex(null);
      setAnswerLocked(false);
      setCorrectPlayerName(null);
      setBuzzerTeam(null);
      setOpenAnswerTeam(null);
      setOpenRevealStartTime(null);
      setGoldenCell(null);
      setTimerMaxSec(30);
    };

    // --- JOIN ---
    socket.on('room_joined', (data: any) => {
      myIdRef.current = data.playerId;
      localStorage.setItem('playerId', data.playerId);
      setIsHost(data.isHost);
      const me = data.players?.find((p: any) => p.id === data.playerId);
      setMyTeam(me?.team ?? null);
      if (data.players) {
        setPlayers(data.players.map((p: any) => ({ ...p, status: p.status ?? 'active' })));
      }
      if (data.gameStatus !== 'PLAYING') {
        router.replace(`/room/${code}`);
      }
    });

    // --- RECONNECT ---
    socket.on('grid_sync', (data: any) => {
      setGrid(data.grid);
      setPhase(data.phase || 'CELL_SELECTION');
      setCurrentTeam(data.currentTeam);
      setCurrentRound(data.currentRound);
      setRoundWins(data.roundWins);
      setWinningPath(data.winningPath);
      if (data.buzzerTeam) setBuzzerTeam(data.buzzerTeam);
      if (data.activeQuestion) {
        setQuestion(data.activeQuestion);
        if (data.phase === 'ANSWERING') setPhase('ANSWERING');
      }
    });

    // --- GAME START ---
    socket.on('game_start', (data: any) => {
      setGrid(data.grid);
      setPhase(data.phase || 'CELL_SELECTION');
      setCurrentTeam(data.currentTeam);
      setCurrentRound(data.round);
      setRoundWins(data.roundWins);
      if (data.players) {
        setPlayers(data.players.map((p: any) => ({ ...p, status: p.status ?? 'active' })));
        const me = data.players.find((p: any) => p.id === myIdRef.current);
        if (me?.team) setMyTeam(me.team);
      }
    });

    // --- CELL SELECTED ---
    socket.on('cell_selected', ({ col, row }: any) => {
      setSelectedCell({ col, row });
    });

    // --- BUZZER STARTED ---
    socket.on('buzzer_started', (data: any) => {
      setQuestion({
        letter: data.letter,
        text: data.text,
        options: data.options,
        endTime: 0,
        col: data.col,
        row: data.row,
      });
      setPhase('BUZZER');
      setAnswerLocked(false);
      setCorrectIndex(null);
      setCorrectPlayerName(null);
      setBuzzerTeam(null);
      setOpenAnswerTeam(null);
      setTimerMaxSec(30);
    });

    // --- GOLDEN CELL ANNOUNCED ---
    socket.on('cell_is_golden', (data: any) => {
      setGoldenCell({ col: data.col, row: data.row });
      SoundEngine.play('golden');
      SoundEngine.vibrate([100, 50, 100]);
    });

    // --- BUZZ CONFIRMED ---
    socket.on('buzz_confirmed', (data: any) => {
      setBuzzerTeam(data.team);
      setPhase('ANSWERING');
      setTimerMaxSec(data.timeLimit ?? 10);
      setQuestion(prev => prev ? { ...prev, endTime: data.endTime } : prev);
    });

    // --- ANSWER WRONG (team-level, with second chance) ---
    socket.on('answer_wrong_team', ({ wrongTeam }: any) => {
      SoundEngine.play('wrong');
      SoundEngine.vibrate([300]);
    });

    // --- ANSWER LOCKED (correct answer) ---
    socket.on('answer_locked', (data: any) => {
      setAnswerLocked(true);
      setCorrectIndex(data.correctIndex);
      setCorrectPlayerName(data.playerName);
      SoundEngine.play('correct');
      SoundEngine.vibrate([100]);
    });

    // --- ANSWER WRONG (to submitter only — legacy, kept for compatibility) ---
    socket.on('answer_wrong', () => {
      SoundEngine.play('wrong');
      SoundEngine.vibrate([300]);
    });

    // --- CELL CLAIMED (delta update) ---
    socket.on('cell_claimed', ({ col, row, owner, isGolden }: any) => {
      setGrid(prev => prev.map(c =>
        c.col === col && c.row === row ? { ...c, owner, isGolden: isGolden || undefined } : c
      ));
      if (isGolden) {
        SoundEngine.play('golden');
        SoundEngine.vibrate([100, 50, 100]);
      }
    });

    // --- ANSWER TIMEOUT ---
    socket.on('answer_timeout', ({ correctIndex: ci, currentTeam: ct }: any) => {
      setCorrectIndex(ci);
      setAnswerLocked(true);
      // Show correct answer briefly, then transition
      setTimeout(() => {
        setPhase('CELL_SELECTION');
        setCurrentTeam(ct);
        clearQuestion();
      }, 1500);
    });

    // --- PHASE CHANGE (after correct answer reveal or second chance) ---
    socket.on('phase_change', ({ phase: p, currentTeam: ct, answeringTeam, timeLimit, endTime: et }: any) => {
      setPhase(p);
      setCurrentTeam(ct);
      if (p === 'CELL_SELECTION') {
        clearQuestion();
      }
      if (p === 'BUZZER_OPEN') {
        setOpenAnswerTeam(answeringTeam ?? null);
        setTimerMaxSec(timeLimit ?? 30);
        setOpenRevealStartTime(Date.now());
        if (et) setQuestion(prev => prev ? { ...prev, endTime: et } : prev);
      }
      if (p === 'BUZZER') {
        // buzz cancelled by host — reset buzzer state
        setBuzzerTeam(null);
        setAnswerLocked(false);
        if (et === 0 || !et) setQuestion(prev => prev ? { ...prev, endTime: 0 } : prev);
      }
    });

    // --- HOST: BUZZER CANCELLED ---
    socket.on('buzz_cancelled', () => {
      setBuzzerTeam(null);
      setAnswerLocked(false);
      setQuestion(prev => prev ? { ...prev, endTime: 0 } : prev);
    });

    // --- HOST: BUZZER_OPEN timed out with no answer ---
    socket.on('buzzer_open_no_answer', ({ correctIndex: ci, currentTeam: ct }: any) => {
      setCorrectIndex(ci);
      setAnswerLocked(true);
      setOpenNoAnswer({ correctIndex: ci, currentTeam: ct });
      // Auto-clear after 8s (safety net)
      if (openNoAnswerTimerRef.current) clearTimeout(openNoAnswerTimerRef.current);
      openNoAnswerTimerRef.current = setTimeout(() => {
        setOpenNoAnswer(null);
        setPhase('CELL_SELECTION');
        setCurrentTeam(ct);
        setQuestion(null);
        setSelectedCell(null);
        setCorrectIndex(null);
        setAnswerLocked(false);
        setCorrectPlayerName(null);
        setBuzzerTeam(null);
        setOpenAnswerTeam(null);
        setOpenRevealStartTime(null);
        setGoldenCell(null);
        setTimerMaxSec(30);
      }, 8000);
    });

    // --- GAME PAUSED/RESUMED ---
    socket.on('game_paused', () => {
      setIsPaused(true);
    });

    socket.on('game_resumed', ({ endTime: et }: any) => {
      setIsPaused(false);
      if (et) setQuestion(prev => prev ? { ...prev, endTime: et } : prev);
    });

    // --- SCORE ADJUSTED ---
    socket.on('score_adjusted', ({ roundWins: rw }: any) => {
      setRoundWins(rw);
    });

    // --- PLAYER STATUS CHANGED ---
    socket.on('player_status_changed', ({ players: updatedPlayers }: any) => {
      if (updatedPlayers) {
        setPlayers(updatedPlayers.map((p: any) => ({ ...p, status: p.status ?? 'active' })));
      }
    });

    // --- PLAYER UPDATE (connection/team changes) ---
    socket.on('player_update', ({ players: updatedPlayers }: any) => {
      if (updatedPlayers) {
        setPlayers(prev => {
          const map = new Map(prev.map(p => [p.id, p]));
          for (const up of updatedPlayers) {
            const existing = map.get(up.id);
            map.set(up.id, { ...up, status: existing?.status ?? 'active' });
          }
          return [...map.values()];
        });
      }
    });

    // --- KICKED ---
    socket.on('kicked', () => {
      router.replace('/');
    });

    // --- ROUND OVER ---
    socket.on('round_over', ({ winner, roundWins: rw, winningPath: wp, leaderboard: lb }: any) => {
      setPhase('ROUND_OVER');
      setRoundWins(rw);
      setWinningPath(wp);
      setRoundWinner(winner);
      if (lb) setLeaderboard(lb);
      clearQuestion();
      SoundEngine.play('win');
      SoundEngine.vibrate([200, 100, 200, 100, 300]);
    });

    // --- ROUND START ---
    socket.on('round_start', ({ round, grid: g, currentTeam: ct, roundWins: rw }: any) => {
      setGrid(g);
      setCurrentRound(round);
      setCurrentTeam(ct);
      setRoundWins(rw);
      setPhase('CELL_SELECTION');
      setWinningPath(null);
      setRoundWinner(null);
      clearQuestion();
    });

    // --- GAME OVER ---
    socket.on('game_over', ({ winner, roundWins: rw, winningPath: wp, leaderboard: lb }: any) => {
      setPhase('GAME_OVER');
      setRoundWins(rw);
      setWinningPath(wp);
      setGameWinner(winner);
      if (lb) setLeaderboard(lb);
      clearQuestion();
      SoundEngine.play('win');
      SoundEngine.vibrate([200, 100, 200, 100, 300]);
    });

    // --- DAIRAT AL-DAW ---
    socket.on('daw_start', ({ winnerTeam, endTime }: any) => {
      setPhase('DAIRAT_AL_DAW');
      setDawState({ winnerTeam, endTime, question: null, lastResult: null, score: 0, total: 0, isEnded: false, finalScore: null });
    });

    socket.on('daw_question', ({ text, options, index }: any) => {
      setDawState(prev => prev ? { ...prev, question: { text, options, index }, lastResult: null } : prev);
    });

    socket.on('daw_result', ({ correct }: any) => {
      setDawState(prev => prev ? {
        ...prev,
        lastResult: correct,
        score: prev.score + (correct ? 1 : 0),
        total: prev.total + 1,
      } : prev);
    });

    socket.on('daw_end', ({ score, total }: any) => {
      setDawState(prev => prev ? {
        ...prev,
        isEnded: true,
        finalScore: { score, total },
      } : prev);
    });

    // --- META ---
    socket.on('host_changed', ({ newHostId }: any) => {
      if (newHostId === myIdRef.current) setIsHost(true);
    });

    socket.on('error', ({ message }: any) => {
      // Room not found after server restart → send to home
      if (message.includes('غير موجودة') || message.includes('انتهت')) {
        router.replace('/');
        return;
      }
      setError(message);
      setTimeout(() => setError(null), 5000);
    });

    // --- EMIT JOIN ---
    socket.emit('join_room', { roomCode: code, playerName: name, savedPlayerId: savedId });

    // --- CLEANUP ---
    return () => {
      socket.off('connect', rejoin);
      const events = [
        'room_joined', 'grid_sync', 'game_start', 'cell_selected',
        'buzzer_started', 'cell_is_golden', 'buzz_confirmed', 'answer_wrong_team',
        'answer_locked', 'answer_wrong', 'cell_claimed',
        'answer_timeout', 'phase_change', 'round_over', 'round_start',
        'game_over', 'daw_start', 'daw_question', 'daw_result', 'daw_end',
        'host_changed', 'error',
        'buzz_cancelled', 'buzzer_open_no_answer', 'game_paused', 'game_resumed',
        'score_adjusted', 'player_status_changed', 'player_update', 'kicked',
      ];
      events.forEach(e => socket.off(e));
    };
  }, [code, router]);

  // ─── RENDER ─────────────────────────────────────────────────

  // Loading
  if (phase === 'loading') {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <div
            className="huroof-logo text-6xl font-black mb-4 animate-pulse"
            style={{ letterSpacing: '0.2em' }}
          >
            حروف
          </div>
          <p className="text-eid-sand/40 text-sm tracking-widest">جاري التحميل...</p>
        </div>
      </main>
    );
  }

  // Dairat Al-Daw
  if (phase === 'DAIRAT_AL_DAW' && dawState) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-6">
        <DairataAlDaw
          winnerTeam={dawState.winnerTeam}
          endTime={dawState.endTime}
          question={dawState.question}
          lastResult={dawState.lastResult}
          score={dawState.score}
          total={dawState.total}
          isHost={isHost}
          onJudge={handleDawJudge}
          isEnded={dawState.isEnded}
          finalScore={dawState.finalScore ?? undefined}
        />
        {dawState.isEnded && (
          <button
            onClick={() => router.push('/')}
            className="mt-6 text-eid-sand/50 hover:text-eid-sand text-sm transition-colors"
          >
            ← الصفحة الرئيسية
          </button>
        )}
      </main>
    );
  }

  // Game Over
  if (phase === 'GAME_OVER') {
    const isRedWin = gameWinner === 'RED';
    const wLabel = isRedWin ? 'الفريق الأحمر' : 'الفريق الأخضر';
    const wNeonColor = isRedWin ? '#FF4444' : '#00FF7F';
    const wGlowColor = isRedWin ? 'rgba(255,44,44,0.5)' : 'rgba(0,255,127,0.5)';
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-6">
        <div className="text-center mb-6 animate-fade-in">
          <div
            className="huroof-logo text-4xl font-black mb-4"
            style={{ letterSpacing: '0.2em' }}
          >
            حروف
          </div>
          <div
            className="inline-block px-6 py-3 rounded-xl mb-3"
            style={{
              border: `2px solid ${wNeonColor}`,
              boxShadow: `0 0 30px ${wGlowColor}`,
              background: 'rgba(6,10,23,0.8)',
            }}
          >
            <p className="text-sm font-bold mb-1" style={{ color: wNeonColor, textShadow: `0 0 10px ${wNeonColor}` }}>
              ★ الفائز ★
            </p>
            <p className="text-2xl font-black" style={{ color: wNeonColor, textShadow: `0 0 15px ${wNeonColor}` }}>
              {wLabel}
            </p>
          </div>
        </div>
        <RoundTracker currentRound={currentRound} roundWins={roundWins} />
        {leaderboard && (
          <div className="w-full max-w-sm mt-4">
            <p className="text-xs font-bold tracking-widest mb-2 text-center" style={{ color: '#C9A227' }}>— ترتيب اللاعبين —</p>
            <Leaderboard data={leaderboard} />
          </div>
        )}
        {isHost && (
          <div className="flex flex-col gap-3 w-full max-w-sm mt-6">
            <button onClick={handleStartDaw} className="btn-primary">
              ★ ابدأ دائرة الضوء
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 rounded-xl border text-sm font-semibold transition-colors"
              style={{ borderColor: 'rgba(201,162,39,0.3)', color: '#C9A227', background: 'rgba(6,10,23,0.7)' }}
            >
              ← الصفحة الرئيسية
            </button>
          </div>
        )}
        {!isHost && (
          <div className="card text-center mt-6">
            <p className="text-eid-sand/50 text-sm">في انتظار المقدم...</p>
          </div>
        )}
      </main>
    );
  }

  // ─── Main game view ─────────────────────────────────────────
  const teamLabel = currentTeam === 'RED' ? 'الأحمر' : 'الأخضر';
  const isMyTurn = !isHost && myTeam === currentTeam && phase === 'CELL_SELECTION';

  return (
    <main className="min-h-dvh flex flex-col px-2 py-2 max-w-2xl mx-auto" style={{ paddingBottom: isHost ? '7rem' : undefined }} dir="rtl">
      {/* Pause banner */}
      {isPaused && (
        <div
          className="fixed top-0 left-0 right-0 z-50 py-2 text-center text-sm font-black"
          style={{ background: 'rgba(255,200,0,0.15)', borderBottom: '2px solid rgba(255,200,0,0.5)', color: '#FFD700' }}
        >
          ⏸ اللعبة متوقفة مؤقتاً من قِبل المقدم...
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-red-900/90 text-red-200 px-4 py-3 rounded-xl text-center text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-1 px-2">
        <div className="text-sm font-black">
          <span
            style={{
              color: currentTeam === 'RED' ? '#FF4444' : '#00FF7F',
              textShadow: currentTeam === 'RED'
                ? '0 0 8px rgba(255,44,44,0.6)'
                : '0 0 8px rgba(0,255,127,0.6)',
            }}
          >
            ● دور {teamLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-black" style={{ color: '#C9A227' }}>
            الجولة {currentRound}
          </div>
          {/* Sound toggle */}
          <button
            onClick={() => {
              SoundEngine.init();
              const next = !soundEnabled;
              SoundEngine.setEnabled(next);
              setSoundEnabled(next);
            }}
            className="text-lg"
            title={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}
            style={{ opacity: 0.7, lineHeight: 1 }}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </div>

      {/* Round Tracker */}
      <RoundTracker currentRound={currentRound} roundWins={roundWins} />

      {/* My status */}
      {myTeam && !isHost && (
        <div className="text-center text-xs mb-1">
          <span className={myTeam === 'RED' ? 'text-red-400' : 'text-green-400'}>
            أنت في {myTeam === 'RED' ? 'الأحمر' : 'الأخضر'}
          </span>
          {isMyTurn && (
            <span className="text-amber-400 mr-2 animate-pulse font-bold">— اختر خلية!</span>
          )}
        </div>
      )}
      {isHost && (
        <div className="text-center text-xs text-eid-sand/30 mb-1">★ المقدم — مشاهدة</div>
      )}

      {/* HexGrid */}
      <HexGrid
        cells={grid}
        phase={phase as GamePhase}
        currentTeam={currentTeam}
        myTeam={myTeam}
        isHost={isHost}
        selectedCell={selectedCell}
        winningPath={winningPath}
        answerLocked={answerLocked}
        goldenCell={goldenCell}
        onCellClick={handleCellClick}
        onHostCellOverride={isHost ? (col, row, owner) => {
          getSocket().emit('host_force_cell_owner', { roomCode: code, col, row, owner });
        } : undefined}
      />

      {/* Correct player announcement */}
      {answerLocked && correctPlayerName && phase !== 'ROUND_OVER' && (
        <div
          className="text-center text-sm font-black mt-1"
          style={{ color: '#69F0AE', textShadow: '0 0 8px rgba(0,255,127,0.5)' }}
        >
          ✓ {correctPlayerName} أجاب بشكل صحيح!
        </div>
      )}

      {/* Question Modal — shown in BUZZER, BUZZER_SECOND_CHANCE, BUZZER_OPEN, ANSWERING, or when correctIndex revealed */}
      {question && (phase === 'BUZZER' || phase === 'BUZZER_SECOND_CHANCE' || phase === 'BUZZER_OPEN' || phase === 'ANSWERING' || correctIndex !== null) && (
        <QuestionModal
          letter={question.letter}
          text={question.text}
          options={question.options}
          endTime={question.endTime}
          timerMaxSec={timerMaxSec}
          currentTeam={currentTeam}
          myTeam={myTeam}
          isHost={isHost}
          answerLocked={answerLocked}
          correctIndex={correctIndex}
          phase={phase as any}
          buzzerTeam={buzzerTeam}
          openAnswerTeam={openAnswerTeam}
          openRevealStartTime={openRevealStartTime}
          mayBuzz={!isHost && myTeam !== null && myTeam !== buzzerTeam && phase !== 'BUZZER_OPEN'}
          onAnswer={handleSubmitAnswer}
          onBuzzIn={handleBuzzIn}
        />
      )}

      {/* openNoAnswer: host can manually continue */}
      {openNoAnswer && isHost && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center p-4 pointer-events-none">
          <button
            className="pointer-events-auto px-8 py-3 rounded-xl font-black text-base"
            style={{
              background: 'rgba(201,162,39,0.15)',
              border: '2px solid rgba(201,162,39,0.6)',
              color: '#C9A227',
              boxShadow: '0 0 20px rgba(201,162,39,0.3)',
              marginBottom: '6rem',
            }}
            onClick={() => {
              if (openNoAnswerTimerRef.current) clearTimeout(openNoAnswerTimerRef.current);
              setOpenNoAnswer(null);
              setPhase('CELL_SELECTION');
              setCurrentTeam(openNoAnswer.currentTeam);
              setQuestion(null); setSelectedCell(null); setCorrectIndex(null); setAnswerLocked(false);
              setCorrectPlayerName(null); setBuzzerTeam(null); setOpenAnswerTeam(null);
              setOpenRevealStartTime(null); setGoldenCell(null); setTimerMaxSec(30);
            }}
          >
            ✓ تم إعلان الإجابة — تالي ←
          </button>
        </div>
      )}

      {/* Round Over overlay */}
      {phase === 'ROUND_OVER' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="card text-center max-w-sm w-full animate-fade-in overflow-y-auto max-h-[90vh]" style={{ border: roundWinner === 'RED' ? '2px solid rgba(255,44,44,0.5)' : '2px solid rgba(0,200,83,0.5)' }}>
            <p
              className="text-xs font-bold tracking-widest mb-2"
              style={{ color: '#C9A227' }}
            >
              — نتيجة الجولة —
            </p>
            <h2
              className="text-2xl font-black mb-3"
              style={{
                color: roundWinner === 'RED' ? '#FF4444' : '#00FF7F',
                textShadow: roundWinner === 'RED' ? '0 0 15px rgba(255,44,44,0.7)' : '0 0 15px rgba(0,255,127,0.7)',
              }}
            >
              فاز {roundWinner === 'RED' ? 'الأحمر' : 'الأخضر'} بالجولة!
            </h2>
            <RoundTracker currentRound={currentRound} roundWins={roundWins} />
            {leaderboard && (
              <div className="mt-4">
                <p className="text-xs font-bold tracking-widest mb-2" style={{ color: '#C9A227' }}>— ترتيب اللاعبين —</p>
                <Leaderboard data={leaderboard} />
              </div>
            )}
            {isHost && (
              <button onClick={handleNextRound} className="btn-primary mt-4">
                ▷ الجولة التالية
              </button>
            )}
            {!isHost && (
              <p className="text-eid-sand/50 text-sm mt-4">في انتظار المقدم...</p>
            )}
          </div>
        </div>
      )}

      {/* Host Dashboard */}
      {isHost && (
        <HostDashboard
          roomCode={code}
          phase={phase}
          isPaused={isPaused}
          players={players}
          roundWins={roundWins}
          hasActiveQuestion={!!question}
        />
      )}
    </main>
  );
}
