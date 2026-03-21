'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import type { HexCell as HexCellData, TeamColor } from '@/lib/hexUtils';
import { HexGrid } from '../../components/HexGrid';
import { QuestionModal } from '../../components/QuestionModal';
import { RoundTracker } from '../../components/RoundTracker';
import { DairataAlDaw } from '../../components/DairataAlDaw';

type GamePhase = 'CELL_SELECTION' | 'BUZZER' | 'BUZZER_SECOND_CHANCE' | 'ANSWERING' | 'ANSWER_REVEAL' | 'ROUND_OVER' | 'GAME_OVER' | 'DAIRAT_AL_DAW';
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

  const [dawState, setDawState] = useState<DawClientState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Handlers (stable with useCallback) ---
  const handleCellClick = useCallback((col: number, row: number) => {
    getSocket().emit('select_cell', { roomCode: code, col, row });
  }, [code]);

  const handleSubmitAnswer = useCallback((index: number) => {
    getSocket().emit('submit_answer', { roomCode: code, answerIndex: index });
  }, [code]);

  const handleBuzzIn = useCallback(() => {
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

    // Helper to reset question state
    const clearQuestion = () => {
      setQuestion(null);
      setSelectedCell(null);
      setCorrectIndex(null);
      setAnswerLocked(false);
      setCorrectPlayerName(null);
      setBuzzerTeam(null);
    };

    // --- JOIN ---
    socket.on('room_joined', (data: any) => {
      myIdRef.current = data.playerId;
      localStorage.setItem('playerId', data.playerId);
      setIsHost(data.isHost);
      const me = data.players?.find((p: any) => p.id === data.playerId);
      setMyTeam(me?.team ?? null);
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
    });

    // --- BUZZ CONFIRMED ---
    socket.on('buzz_confirmed', (data: any) => {
      setBuzzerTeam(data.team);
      setPhase('ANSWERING');
      setQuestion(prev => prev ? { ...prev, endTime: data.endTime } : prev);
    });

    // --- ANSWER WRONG (team-level, with second chance) ---
    socket.on('answer_wrong_team', ({ wrongTeam }: any) => {
      if ('vibrate' in navigator) navigator.vibrate([150, 50, 150]);
    });

    // --- ANSWER LOCKED (correct answer) ---
    socket.on('answer_locked', (data: any) => {
      setAnswerLocked(true);
      setCorrectIndex(data.correctIndex);
      setCorrectPlayerName(data.playerName);
    });

    // --- ANSWER WRONG (to submitter only — legacy, kept for compatibility) ---
    socket.on('answer_wrong', () => {
      if ('vibrate' in navigator) navigator.vibrate([200]);
    });

    // --- CELL CLAIMED (delta update) ---
    socket.on('cell_claimed', ({ col, row, owner }: any) => {
      setGrid(prev => prev.map(c =>
        c.col === col && c.row === row ? { ...c, owner } : c
      ));
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
    socket.on('phase_change', ({ phase: p, currentTeam: ct }: any) => {
      setPhase(p);
      setCurrentTeam(ct);
      if (p === 'CELL_SELECTION') {
        clearQuestion();
      }
      // BUZZER_SECOND_CHANCE: clear buzzerTeam so other team can buzz
      if (p === 'BUZZER_SECOND_CHANCE') {
        // keep question displayed, just change phase — buzzerTeam is reset server-side
        // the client keeps buzzerTeam so it knows who answered wrong
      }
    });

    // --- ROUND OVER ---
    socket.on('round_over', ({ winner, roundWins: rw, winningPath: wp }: any) => {
      setPhase('ROUND_OVER');
      setRoundWins(rw);
      setWinningPath(wp);
      setRoundWinner(winner);
      clearQuestion();
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
    socket.on('game_over', ({ winner, roundWins: rw, winningPath: wp }: any) => {
      setPhase('GAME_OVER');
      setRoundWins(rw);
      setWinningPath(wp);
      setGameWinner(winner);
      clearQuestion();
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
      const events = [
        'room_joined', 'grid_sync', 'game_start', 'cell_selected',
        'buzzer_started', 'buzz_confirmed', 'answer_wrong_team',
        'answer_locked', 'answer_wrong', 'cell_claimed',
        'answer_timeout', 'phase_change', 'round_over', 'round_start',
        'game_over', 'daw_start', 'daw_question', 'daw_result', 'daw_end',
        'host_changed', 'error',
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
            <p className="text-eid-sand/50 text-sm">في انتظار الكابتن...</p>
          </div>
        )}
      </main>
    );
  }

  // ─── Main game view ─────────────────────────────────────────
  const teamLabel = currentTeam === 'RED' ? 'الأحمر' : 'الأخضر';
  const isMyTurn = !isHost && myTeam === currentTeam && phase === 'CELL_SELECTION';

  return (
    <main className="min-h-dvh flex flex-col px-2 py-2 max-w-2xl mx-auto" dir="rtl">
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
        <div className="text-sm font-black" style={{ color: '#C9A227' }}>
          الجولة {currentRound}
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
        <div className="text-center text-xs text-eid-sand/30 mb-1">★ الكابتن — مشاهدة</div>
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
        onCellClick={handleCellClick}
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

      {/* Question Modal — shown in BUZZER, BUZZER_SECOND_CHANCE, ANSWERING, or when correctIndex revealed */}
      {question && (phase === 'BUZZER' || phase === 'BUZZER_SECOND_CHANCE' || phase === 'ANSWERING' || correctIndex !== null) && (
        <QuestionModal
          letter={question.letter}
          text={question.text}
          options={question.options}
          endTime={question.endTime}
          currentTeam={currentTeam}
          myTeam={myTeam}
          isHost={isHost}
          answerLocked={answerLocked}
          correctIndex={correctIndex}
          phase={phase as any}
          buzzerTeam={buzzerTeam}
          mayBuzz={!isHost && myTeam !== null && myTeam !== buzzerTeam}
          onAnswer={handleSubmitAnswer}
          onBuzzIn={handleBuzzIn}
        />
      )}

      {/* Round Over overlay */}
      {phase === 'ROUND_OVER' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="card text-center max-w-sm w-full animate-fade-in" style={{ border: roundWinner === 'RED' ? '2px solid rgba(255,44,44,0.5)' : '2px solid rgba(0,200,83,0.5)' }}>
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
            {isHost && (
              <button onClick={handleNextRound} className="btn-primary mt-4">
                ▷ الجولة التالية
              </button>
            )}
            {!isHost && (
              <p className="text-eid-sand/50 text-sm mt-4">في انتظار الكابتن...</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
