import { Server, Socket } from 'socket.io';
import { prisma } from './prisma';
import {
  HexCell,
  TeamColor,
  initGrid,
  cellKey,
  checkWin,
  getWinningPath,
  preWarmNeighborsCache,
} from './hexUtils';
import {
  QuestionData,
  loadQuestionsByLetter,
  pickQuestion,
  getAvailableLetters,
} from './questionLoader';
import {
  DawState,
  createDawState,
  getCurrentDawQuestion,
  advanceDaw,
  clearDawTimeout,
} from './dawEngine';

// ─── Config ───────────────────────────────────────────────────
const QUESTION_DURATION_MS =
  parseInt(process.env.QUESTION_DURATION_SECONDS || '30') * 1000;
const BUZZER_ANSWER_MS = 10000;   // 10 seconds after buzzing in
const BUZZER_OPEN_MS         = 30000;   // visible countdown after options revealed
const BUZZER_OPEN_REVEAL_MS  = 5000;    // 2s intro + 3×1s for each option
const BUZZER_OPEN_TOTAL_MS   = BUZZER_OPEN_REVEAL_MS + BUZZER_OPEN_MS; // 35s total server window
const ROUNDS_TO_WIN = 3;
const ANSWER_REVEAL_MS = 1500;
// Timing for the new reveal-then-buzz flow:
const REVEAL_DELAY_MS   = 2000;  // question shown 2s before options start appearing
const REVEAL_PER_OPT_MS = 1000;  // one option revealed per second (4 options → 4s)
const REVEAL_TOTAL_MS   = REVEAL_DELAY_MS + 4 * REVEAL_PER_OPT_MS; // 6s total
const BUZZER_WAIT_MS    = 30000; // countdown starts after all options are revealed
const BUZZER_TOTAL_MS   = REVEAL_TOTAL_MS + BUZZER_WAIT_MS;

// ─── Types ────────────────────────────────────────────────────

type GamePhase =
  | 'CELL_SELECTION'
  | 'BUZZER'
  | 'BUZZER_SECOND_CHANCE'
  | 'BUZZER_OPEN'          // other team answers directly (no buzz needed)
  | 'ANSWERING'
  | 'ANSWER_REVEAL'
  | 'ROUND_OVER'
  | 'GAME_OVER'
  | 'DAIRAT_AL_DAW'
  | 'TIEBREAKER';          // opening question — winner picks first cell

interface PlayerState {
  id: string;
  name: string;
  joinOrder: number;
  isConnected: boolean;
  socketId: string | null;
  team: TeamColor | null;
  status: 'active' | 'away';
  stats: {
    correct: number;
    wrong: number;
    buzzes: number;
    totalTimeMs: number;
    goldenWins: number;
  };
}

interface HexGameState {
  sessionId: string;
  hostPlayerId: string;
  phase: GamePhase;
  currentRound: number;
  roundWins: Record<TeamColor, number>;
  currentTeam: TeamColor;
  grid: Map<string, HexCell>;
  gridVersion: number;
  redTeam: Set<string>;
  greenTeam: Set<string>;
  selectedCell: { col: number; row: number } | null;
  activeQuestion: {
    id: number;
    letter: string;
    text: string;
    options: string[];
    correctIndex: number;
    endTime: number;
    buzzerOpenTime?: number;  // when the 30s countdown starts (after options revealed)
  } | null;
  answerLocked: boolean;
  questionTimer: ReturnType<typeof setTimeout> | null;
  questionsByLetter: Map<string, QuestionData[]>;
  usedQuestions: Set<number>;
  players: Map<string, PlayerState>;
  winningPath: string[] | null;
  dawState: DawState | null;
  buzzerTeam: TeamColor | null;           // team that buzzed in (or null)
  buzzerLockedTeams: Set<TeamColor>;     // teams that already had their chance
  buzzerPlayerId: string | null;         // specific player who buzzed in
  goldenCellKey: string | null;          // secret — not sent to clients until claimed
  currentQuestionStartTime: number;      // Date.now() when answering started
  isPaused: boolean;                     // host paused the game
  pausedAt: number | null;               // timestamp when paused
  pausedTimeRemaining: number;           // ms left on the timer when paused
  lastCellWinner: TeamColor | null;       // team that answered last correct (selects next cell)
}

// ─── In-memory state ──────────────────────────────────────────
const activeGames = new Map<string, HexGameState>();
// Pending host-transfer timeouts — cancelled if the host reconnects within the grace period
const pendingHostTransfers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Helpers ──────────────────────────────────────────────────

function otherTeam(team: TeamColor): TeamColor {
  return team === 'RED' ? 'GREEN' : 'RED';
}

function getConnectedTeamMembers(game: HexGameState, team: TeamColor): PlayerState[] {
  const ids = team === 'RED' ? game.redTeam : game.greenTeam;
  return [...ids]
    .map(id => game.players.get(id))
    .filter((p): p is PlayerState => !!p && p.isConnected);
}

function buildGridArray(game: HexGameState): HexCell[] {
  return [...game.grid.values()];
}

function buildPlayersPayload(game: HexGameState) {
  return [...game.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    isConnected: p.isConnected,
    team: p.team,
    joinOrder: p.joinOrder,
    status: p.status,
  }));
}

function cleanupGame(roomCode: string) {
  const game = activeGames.get(roomCode);
  if (!game) return;
  if (game.questionTimer) clearTimeout(game.questionTimer);
  if (game.dawState) clearDawTimeout(game.dawState);
  activeGames.delete(roomCode);
}

// ─── Engine ───────────────────────────────────────────────────

export function initGameEngine(io: Server) {
  preWarmNeighborsCache();

  setInterval(() => {
    for (const [roomCode, game] of activeGames.entries()) {
      const anyConnected = [...game.players.values()].some(p => p.isConnected);
      if (!anyConnected) cleanupGame(roomCode);
    }
  }, 5 * 60_000);

  io.on('connection', (socket: Socket) => {

    socket.on('join_room', async ({
      roomCode, playerName, savedPlayerId,
    }: { roomCode: string; playerName: string; savedPlayerId?: string }) => {
      try {
        const session = await prisma.gameSession.findUnique({
          where: { code: roomCode },
          include: { players: { orderBy: { joinOrder: 'asc' } } },
        });
        if (!session) { socket.emit('error', { message: 'الغرفة غير موجودة' }); return; }
        if (session.status === 'ENDED') { socket.emit('error', { message: 'انتهت هذه اللعبة' }); return; }

        let player; let isReconnect = false;

        if (savedPlayerId) {
          const existing = session.players.find(p => p.id === savedPlayerId);
          if (existing) {
            player = await prisma.player.update({ where: { id: savedPlayerId }, data: { socketId: socket.id, isConnected: true } });
            isReconnect = true;
            const game = activeGames.get(roomCode);
            if (game) { const ps = game.players.get(savedPlayerId); if (ps) { ps.socketId = socket.id; ps.isConnected = true; } }
            // Cancel any pending host-transfer (host reconnected in time)
            if (pendingHostTransfers.has(savedPlayerId)) {
              clearTimeout(pendingHostTransfers.get(savedPlayerId)!);
              pendingHostTransfers.delete(savedPlayerId);
            }
          }
        }

        if (!player) {
          const bySocket = session.players.find(p => p.socketId === socket.id);
          if (bySocket) { player = bySocket; isReconnect = true; }
        }

        if (!player) {
          if (session.status === 'PLAYING') { socket.emit('error', { message: 'اللعبة بدأت، لا يمكن الانضمام الآن' }); return; }
          await prisma.player.updateMany({ where: { socketId: socket.id }, data: { socketId: null } });
          const joinOrder = session.players.length + 1;
          player = await prisma.player.create({ data: { name: playerName, socketId: socket.id, joinOrder, sessionId: session.id } });
          if (joinOrder === 1) await prisma.gameSession.update({ where: { id: session.id }, data: { hostId: player.id } });
        }

        socket.data.playerId = player.id;
        socket.data.roomCode = roomCode;
        socket.join(roomCode);

        const updatedSession = await prisma.gameSession.findUnique({ where: { code: roomCode }, include: { players: { orderBy: { joinOrder: 'asc' } } } });
        let isHost = updatedSession!.hostId === player.id;
        const game = activeGames.get(roomCode);
        // Safety: a team player should never be the host during an active game
        if (isHost && game && (game.redTeam.has(player.id) || game.greenTeam.has(player.id))) {
          isHost = false;
        }
        const playersData = updatedSession!.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected, team: (p as any).team ?? null, joinOrder: p.joinOrder }));

        socket.emit('room_joined', { playerId: player.id, isHost, players: playersData, gameStatus: session.status, phase: game?.phase ?? null });

        if (isReconnect && game) {
          const isBuzzerPhase = game.phase === 'BUZZER' || game.phase === 'BUZZER_SECOND_CHANCE' || game.phase === 'TIEBREAKER';
          socket.emit('grid_sync', {
            grid: buildGridArray(game), gridVersion: game.gridVersion, phase: game.phase,
            currentTeam: game.currentTeam, currentRound: game.currentRound, roundWins: game.roundWins, winningPath: game.winningPath,
            activeQuestion: (game.phase === 'ANSWERING' && game.activeQuestion)
              ? { letter: game.activeQuestion.letter, text: game.activeQuestion.text, options: game.activeQuestion.options, endTime: game.activeQuestion.endTime, col: game.selectedCell?.col, row: game.selectedCell?.row }
              : (isBuzzerPhase && game.activeQuestion)
              ? { letter: game.activeQuestion.letter, text: game.activeQuestion.text, options: game.activeQuestion.options, endTime: game.activeQuestion.endTime, buzzerOpenTime: game.activeQuestion.buzzerOpenTime, col: game.selectedCell?.col, row: game.selectedCell?.row }
              : (game.phase === 'BUZZER_OPEN' && game.activeQuestion)
              ? { letter: game.activeQuestion.letter, text: game.activeQuestion.text, options: game.activeQuestion.options, endTime: game.activeQuestion.endTime, col: game.selectedCell?.col, row: game.selectedCell?.row }
              : null,
            buzzerTeam: game.buzzerTeam,
            answeringTeam: game.phase === 'BUZZER_OPEN' && game.buzzerTeam ? otherTeam(game.buzzerTeam) : null,
            isPaused: game.isPaused,
          });
        }
        socket.to(roomCode).emit('player_update', { players: playersData });
      } catch (err) {
        console.error('join_room error:', err);
        socket.emit('error', { message: 'حدث خطأ، حاول مرة أخرى' });
      }
    });

    socket.on('set_team', async ({ roomCode, team }: { roomCode: string; team: TeamColor }) => {
      const playerId = socket.data.playerId as string;
      if (!playerId) return;
      try {
        const session = await prisma.gameSession.findUnique({ where: { code: roomCode }, select: { id: true, status: true, hostId: true } });
        if (!session || session.status !== 'WAITING' || session.hostId === playerId) return;
        await prisma.player.update({ where: { id: playerId }, data: { team } });
        const players = await prisma.player.findMany({ where: { sessionId: session.id }, orderBy: { joinOrder: 'asc' }, select: { id: true, name: true, team: true, isConnected: true } });
        io.to(roomCode).emit('teams_updated', { players: players.map(p => ({ id: p.id, name: p.name, team: p.team, isConnected: p.isConnected })) });
      } catch (err) { console.error('set_team error:', err); }
    });

    socket.on('start_game', async ({ roomCode }: { roomCode: string }) => {
      try {
        const playerId = socket.data.playerId as string;
        const session = await prisma.gameSession.findUnique({ where: { code: roomCode }, include: { players: { orderBy: { joinOrder: 'asc' } } } });
        if (!session || session.status !== 'WAITING') return;
        if (session.hostId !== playerId) { socket.emit('error', { message: 'فقط المقدم يمكنه بدء اللعبة' }); return; }

        const nonHost = session.players.filter(p => p.id !== session.hostId);
        const redPlayers = nonHost.filter(p => (p as any).team === 'RED');
        const greenPlayers = nonHost.filter(p => (p as any).team === 'GREEN');
        if (redPlayers.length < 1 || greenPlayers.length < 1) { socket.emit('error', { message: 'يجب أن يكون في كل فريق لاعب واحد على الأقل' }); return; }

        const questionsByLetter = await loadQuestionsByLetter();
        const letters = getAvailableLetters(questionsByLetter);
        if (letters.length === 0) { socket.emit('error', { message: 'لا توجد أسئلة في قاعدة البيانات' }); return; }

        const players = new Map<string, PlayerState>();
        for (const p of session.players) players.set(p.id, {
          id: p.id, name: p.name, joinOrder: p.joinOrder, isConnected: p.isConnected, socketId: p.socketId, team: (p as any).team ?? null,
          status: 'active',
          stats: { correct: 0, wrong: 0, buzzes: 0, totalTimeMs: 0, goldenWins: 0 },
        });

        const initialGrid = initGrid(letters);
        const initialKeys = [...initialGrid.keys()];
        const goldenCellKey = initialKeys[Math.floor(Math.random() * initialKeys.length)];

        const game: HexGameState = {
          sessionId: session.id, hostPlayerId: session.hostId!,
          phase: 'TIEBREAKER', currentRound: 1, roundWins: { RED: 0, GREEN: 0 }, currentTeam: 'RED',
          grid: initialGrid, gridVersion: 0,
          redTeam: new Set(redPlayers.map(p => p.id)), greenTeam: new Set(greenPlayers.map(p => p.id)),
          selectedCell: null, activeQuestion: null, answerLocked: false, questionTimer: null,
          questionsByLetter, usedQuestions: new Set(), players, winningPath: null, dawState: null,
          buzzerTeam: null, buzzerLockedTeams: new Set(),
          buzzerPlayerId: null, goldenCellKey, currentQuestionStartTime: 0,
          isPaused: false, pausedAt: null, pausedTimeRemaining: 0,
          lastCellWinner: null,
        };
        activeGames.set(roomCode, game);
        await prisma.gameSession.update({ where: { id: session.id }, data: { status: 'PLAYING' } });

        // Fire a TIEBREAKER question — whoever answers correctly picks the first cell
        const tbLetterIdx = Math.floor(Math.random() * letters.length);
        const tbLetter = letters[tbLetterIdx];
        const tbQuestion = pickQuestion(tbLetter, questionsByLetter, game.usedQuestions);

        const tbNow = Date.now();
        const tbRevealTime = tbNow + REVEAL_DELAY_MS;           // options start appearing
        const tbBuzzerOpenTime = tbNow + REVEAL_TOTAL_MS;       // countdown visible
        const tbEndTime = tbNow + BUZZER_TOTAL_MS;              // auto-timeout

        if (tbQuestion) {
          game.activeQuestion = { id: tbQuestion.id, letter: tbLetter, text: tbQuestion.text, options: tbQuestion.options, correctIndex: tbQuestion.correctIndex, endTime: tbEndTime, buzzerOpenTime: tbBuzzerOpenTime };
          game.currentQuestionStartTime = 0;
          game.questionTimer = setTimeout(() => handleTiebreakerTimeout(io, roomCode), BUZZER_TOTAL_MS);
        }

        io.to(roomCode).emit('game_start', {
          phase: game.phase, grid: buildGridArray(game), currentTeam: game.currentTeam,
          round: game.currentRound, roundWins: game.roundWins, gridVersion: game.gridVersion,
          players: buildPlayersPayload(game),
        });

        if (tbQuestion) {
          io.to(roomCode).emit('tiebreaker_question', {
            letter: tbLetter, text: tbQuestion.text, options: tbQuestion.options,
            optionRevealTime: tbRevealTime, buzzerOpenTime: tbBuzzerOpenTime, endTime: tbEndTime,
          });
        } else {
          // No tiebreaker question available — start directly
          game.phase = 'CELL_SELECTION';
          game.currentTeam = 'RED';
          game.activeQuestion = null;
          io.to(roomCode).emit('tiebreaker_skip', { currentTeam: 'RED' });
        }
      } catch (err) { console.error('start_game error:', err); socket.emit('error', { message: 'حدث خطأ أثناء بدء اللعبة' }); }
    });

    // ─── Tiebreaker buzz ────────────────────────────────────────
    socket.on('buzz_in_tiebreaker', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.phase !== 'TIEBREAKER' || game.answerLocked) return;
      if (game.isPaused) return;
      if (playerId === game.hostPlayerId) return;

      const playerTeam: TeamColor | null = game.redTeam.has(playerId) ? 'RED'
        : game.greenTeam.has(playerId) ? 'GREEN' : null;
      if (!playerTeam || game.buzzerLockedTeams.has(playerTeam)) return;

      if (game.questionTimer) clearTimeout(game.questionTimer);
      const playerState = game.players.get(playerId);
      const endTime = Date.now() + BUZZER_ANSWER_MS;
      game.phase = 'ANSWERING';
      game.buzzerTeam = playerTeam;
      game.buzzerLockedTeams.add(playerTeam);
      game.buzzerPlayerId = playerId;
      game.answerLocked = false;
      game.currentQuestionStartTime = Date.now();
      game.activeQuestion!.endTime = endTime;
      game.questionTimer = setTimeout(() => handleTiebreakerAnswerTimeout(io, roomCode), BUZZER_ANSWER_MS);
      io.to(roomCode).emit('buzz_confirmed', {
        team: playerTeam,
        playerName: playerState?.name ?? '',
        endTime,
        timeLimit: BUZZER_ANSWER_MS / 1000,
        isTiebreaker: true,
      });
    });

    socket.on('submit_tiebreaker_answer', ({ roomCode, answerIndex }: { roomCode: string; answerIndex: number }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.phase !== 'ANSWERING' || game.answerLocked || !game.activeQuestion) return;
      if (!game.buzzerTeam) return;
      const teamSet = game.buzzerTeam === 'RED' ? game.redTeam : game.greenTeam;
      if (!teamSet.has(playerId)) return;

      const isCorrect = answerIndex === game.activeQuestion.correctIndex;
      game.answerLocked = true;
      if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }

      if (isCorrect) {
        const winnerTeam = game.buzzerTeam;
        io.to(roomCode).emit('tiebreaker_end', { winnerTeam, correctIndex: game.activeQuestion.correctIndex });
        setTimeout(() => {
          const g = activeGames.get(roomCode);
          if (!g) return;
          g.phase = 'CELL_SELECTION';
          g.currentTeam = winnerTeam;
          g.activeQuestion = null; g.buzzerTeam = null; g.buzzerLockedTeams = new Set();
          g.buzzerPlayerId = null; g.answerLocked = false;
          io.to(roomCode).emit('phase_change', { phase: 'CELL_SELECTION', currentTeam: g.currentTeam });
        }, ANSWER_REVEAL_MS);
      } else {
        // Wrong — give other team a chance
        const otherT = otherTeam(game.buzzerTeam);
        if (!game.buzzerLockedTeams.has(otherT)) {
          game.phase = 'TIEBREAKER';
          game.answerLocked = false;
          game.buzzerTeam = null; game.buzzerPlayerId = null;
          const endTime = Date.now() + BUZZER_TOTAL_MS;
          game.activeQuestion.endTime = endTime;
          game.questionTimer = setTimeout(() => handleTiebreakerTimeout(io, roomCode), BUZZER_TOTAL_MS);
          io.to(roomCode).emit('tiebreaker_wrong', { wrongTeam: game.buzzerLockedTeams.values().next().value, correctIndex: -1 });
        } else {
          // Both teams failed — pick winner randomly
          const coin = Math.random() < 0.5 ? 'RED' : 'GREEN';
          io.to(roomCode).emit('tiebreaker_end', { winnerTeam: coin, correctIndex: game.activeQuestion.correctIndex, randomPick: true });
          setTimeout(() => {
            const g = activeGames.get(roomCode);
            if (!g) return;
            g.phase = 'CELL_SELECTION'; g.currentTeam = coin;
            g.activeQuestion = null; g.buzzerTeam = null; g.buzzerLockedTeams = new Set();
            g.buzzerPlayerId = null; g.answerLocked = false;
            io.to(roomCode).emit('phase_change', { phase: 'CELL_SELECTION', currentTeam: g.currentTeam });
          }, ANSWER_REVEAL_MS);
        }
      }
    });

    socket.on('select_cell', ({ roomCode, col, row }: { roomCode: string; col: number; row: number }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.phase !== 'CELL_SELECTION') return;
      if (playerId === game.hostPlayerId) return;
      const teamSet = game.currentTeam === 'RED' ? game.redTeam : game.greenTeam;
      if (!teamSet.has(playerId)) return;
      const key = cellKey(col, row);
      const cell = game.grid.get(key);
      if (!cell || cell.owner !== null) return;

      const question = pickQuestion(cell.letter, game.questionsByLetter, game.usedQuestions);
      if (!question) { socket.emit('error', { message: 'لا توجد أسئلة لهذا الحرف' }); return; }

      // Transition to BUZZER phase — new timing: show question→2s→options 1/sec→then 30s timer
      game.phase = 'BUZZER';
      game.selectedCell = { col, row };
      game.answerLocked = false;
      game.buzzerTeam = null;
      game.buzzerLockedTeams = new Set();
      game.buzzerPlayerId = null;
      game.activeQuestion = { id: question.id, letter: cell.letter, text: question.text, options: question.options, correctIndex: question.correctIndex, endTime: 0, buzzerOpenTime: 0 };

      const now = Date.now();
      const optionRevealTime = now + REVEAL_DELAY_MS;       // 2s: options start
      const buzzerOpenTime   = now + REVEAL_TOTAL_MS;       // 6s: countdown visible
      const endTime          = now + BUZZER_TOTAL_MS;       // 36s: auto timeout
      game.activeQuestion.endTime = endTime;
      game.activeQuestion.buzzerOpenTime = buzzerOpenTime;

      // Safety timeout: if no one buzzes
      if (game.questionTimer) clearTimeout(game.questionTimer);
      game.questionTimer = setTimeout(() => handleBuzzerTimeout(io, roomCode), BUZZER_TOTAL_MS);

      const isGoldenCell = game.goldenCellKey === key;
      io.to(roomCode).emit('cell_selected', { col, row, letter: cell.letter, team: game.currentTeam });
      if (isGoldenCell) {
        io.to(roomCode).emit('cell_is_golden', { col, row, letter: cell.letter });
      }
      io.to(roomCode).emit('buzzer_started', {
        letter: cell.letter, text: question.text, options: question.options, col, row,
        optionRevealTime, buzzerOpenTime, endTime,
      });
    });

    socket.on('buzz_in', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game) return;
      if (game.isPaused) return;
      if (game.phase !== 'BUZZER' && game.phase !== 'BUZZER_SECOND_CHANCE') return;
      if (playerId === game.hostPlayerId) return;

      const playerTeam: TeamColor | null = game.redTeam.has(playerId) ? 'RED'
        : game.greenTeam.has(playerId) ? 'GREEN' : null;
      if (!playerTeam) return;

      // Block teams that already had their chance
      if (game.buzzerLockedTeams.has(playerTeam)) return;
      // In BUZZER_SECOND_CHANCE, only the NON-buzzer team can buzz
      if (game.phase === 'BUZZER_SECOND_CHANCE' && game.buzzerTeam === playerTeam) return;

      // Cancel the on-going timeout (buzzer wait or second-chance wait)
      if (game.questionTimer) clearTimeout(game.questionTimer);

      const playerState = game.players.get(playerId);
      if (playerState) playerState.stats.buzzes++;
      const endTime = Date.now() + BUZZER_ANSWER_MS;
      game.phase = 'ANSWERING';
      game.buzzerTeam = playerTeam;
      game.buzzerLockedTeams.add(playerTeam);
      game.buzzerPlayerId = playerId;
      game.answerLocked = false;
      game.currentQuestionStartTime = Date.now();
      game.activeQuestion!.endTime = endTime;
      game.questionTimer = setTimeout(() => handleBuzzerAnswerTimeout(io, roomCode), BUZZER_ANSWER_MS);

      io.to(roomCode).emit('buzz_confirmed', {
        team: playerTeam,
        playerName: playerState?.name ?? '',
        endTime,
        timeLimit: BUZZER_ANSWER_MS / 1000,
      });
    });

    socket.on('submit_answer', ({ roomCode, answerIndex }: { roomCode: string; answerIndex: number }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.answerLocked) return;
      if (game.isPaused) return;

      // Determine answering team based on phase
      let answeringTeam: TeamColor;
      if (game.phase === 'ANSWERING') {
        answeringTeam = game.buzzerTeam ?? game.currentTeam;
      } else if (game.phase === 'BUZZER_OPEN') {
        // BUZZER_OPEN: the OTHER team answers directly (no buzz needed)
        answeringTeam = game.buzzerTeam ? otherTeam(game.buzzerTeam) : game.currentTeam;
      } else {
        return;
      }

      const teamSet = answeringTeam === 'RED' ? game.redTeam : game.greenTeam;
      if (!teamSet.has(playerId) || !game.activeQuestion || !game.selectedCell) return;

      const isCorrect = answerIndex === game.activeQuestion.correctIndex;

      if (!isCorrect) {
        // Lock immediately to prevent further submissions
        game.answerLocked = true;
        if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }

        const playerState = game.players.get(playerId);
        if (playerState) playerState.stats.wrong++;
        const otherT = otherTeam(answeringTeam);

        io.to(roomCode).emit('answer_wrong_team', { wrongTeam: answeringTeam, playerName: playerState?.name ?? '' });

        if (game.phase === 'ANSWERING' && !game.buzzerLockedTeams.has(otherT)) {
          // First buzz was wrong → award cell to the other team immediately
          const { col, row } = game.selectedCell!;
          const ck = cellKey(col, row);
          const isGolden = game.goldenCellKey === ck;
          const cell = game.grid.get(ck);
          if (cell) {
            cell.owner = otherT;
            if (isGolden) cell.isGolden = true;
          }
          game.gridVersion++;
          io.to(roomCode).emit('answer_locked', {
            correctPlayerId: null, playerName: '', col, row,
            correctIndex: game.activeQuestion!.correctIndex, isWrongPenalty: true,
          });
          io.to(roomCode).emit('cell_claimed', { col, row, owner: otherT, gridVersion: game.gridVersion, isGolden });
          game.phase = 'ANSWER_REVEAL';

          setTimeout(() => {
            const g = activeGames.get(roomCode);
            if (!g) return;
            if (checkWin(g.grid, otherT)) {
              g.winningPath = getWinningPath(g.grid, otherT);
              g.roundWins[otherT]++;
              if (g.roundWins[otherT] >= ROUNDS_TO_WIN) {
                g.phase = 'GAME_OVER';
                io.to(roomCode).emit('game_over', { winner: otherT, roundWins: g.roundWins, winningPath: g.winningPath, leaderboard: buildLeaderboard(g) });
              } else {
                g.phase = 'ROUND_OVER';
                io.to(roomCode).emit('round_over', { winner: otherT, roundWins: g.roundWins, winningPath: g.winningPath, leaderboard: buildLeaderboard(g) });
              }
            } else {
              g.currentTeam = otherT;
              g.lastCellWinner = otherT;
              g.phase = 'CELL_SELECTION';
              g.selectedCell = null;
              g.activeQuestion = null;
              g.buzzerTeam = null;
              g.buzzerPlayerId = null;
              g.buzzerLockedTeams = new Set();
              io.to(roomCode).emit('phase_change', { phase: g.phase, currentTeam: g.currentTeam });
            }
          }, ANSWER_REVEAL_MS);
        } else {
          // BUZZER_OPEN wrong, or second-chance buzz wrong → release cell
          releaseCellAndChangeTurn(io, roomCode, game, game.activeQuestion!.correctIndex);
        }
        return;
      }

      // ─── CORRECT ANSWER ───
      game.answerLocked = true;
      if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }

      const timeTakenMs = game.currentQuestionStartTime > 0
        ? Math.max(0, Date.now() - game.currentQuestionStartTime)
        : 0;

      const { col, row } = game.selectedCell;
      const playerState = game.players.get(playerId);
      const cellWinner = game.phase === 'BUZZER_OPEN'
        ? (game.buzzerTeam ? otherTeam(game.buzzerTeam) : game.currentTeam)
        : (game.buzzerTeam ?? game.currentTeam);

      if (playerState) {
        playerState.stats.correct++;
        playerState.stats.totalTimeMs += timeTakenMs;
      }

      // Check if this is the golden cell
      const ck = cellKey(col, row);
      const isGolden = game.goldenCellKey === ck;
      if (isGolden && playerState) playerState.stats.goldenWins++;

      io.to(roomCode).emit('answer_locked', { correctPlayerId: playerId, playerName: playerState?.name ?? '', col, row, correctIndex: game.activeQuestion.correctIndex });

      const cell = game.grid.get(ck);
      if (cell) {
        cell.owner = cellWinner;
        if (isGolden) cell.isGolden = true;
      }
      game.gridVersion++;
      io.to(roomCode).emit('cell_claimed', { col, row, owner: cellWinner, gridVersion: game.gridVersion, isGolden });
      game.phase = 'ANSWER_REVEAL';

      setTimeout(() => {
        const g = activeGames.get(roomCode);
        if (!g) return;
        if (checkWin(g.grid, cellWinner)) {
          g.winningPath = getWinningPath(g.grid, cellWinner);
          g.roundWins[cellWinner]++;
          if (g.roundWins[cellWinner] >= ROUNDS_TO_WIN) {
            g.phase = 'GAME_OVER';
            io.to(roomCode).emit('game_over', { winner: cellWinner, roundWins: g.roundWins, winningPath: g.winningPath, leaderboard: buildLeaderboard(g) });
          } else {
            g.phase = 'ROUND_OVER';
            io.to(roomCode).emit('round_over', { winner: cellWinner, roundWins: g.roundWins, winningPath: g.winningPath, leaderboard: buildLeaderboard(g) });
          }
        } else {
          // Winner of this question picks next cell
          g.currentTeam = cellWinner;
          g.lastCellWinner = cellWinner;
          g.phase = 'CELL_SELECTION';
          g.selectedCell = null;
          g.activeQuestion = null;
          g.buzzerTeam = null;
          g.buzzerPlayerId = null;
          g.buzzerLockedTeams = new Set();
          io.to(roomCode).emit('phase_change', { phase: g.phase, currentTeam: g.currentTeam });
        }
      }, ANSWER_REVEAL_MS);
    });

    socket.on('next_round', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.phase !== 'ROUND_OVER' || playerId !== game.hostPlayerId) return;
      const letters = getAvailableLetters(game.questionsByLetter);
      game.grid = initGrid(letters); game.gridVersion = 0;
      game.currentRound++; game.currentTeam = otherTeam(game.currentTeam);
      game.phase = 'CELL_SELECTION'; game.selectedCell = null; game.activeQuestion = null;
      game.winningPath = null; game.usedQuestions = new Set(); game.answerLocked = false;
      game.buzzerTeam = null; game.buzzerPlayerId = null; game.buzzerLockedTeams = new Set();
      // Pick a new golden cell for the new round
      const newKeys = [...game.grid.keys()];
      game.goldenCellKey = newKeys[Math.floor(Math.random() * newKeys.length)];
      io.to(roomCode).emit('round_start', { round: game.currentRound, grid: buildGridArray(game), currentTeam: game.currentTeam, roundWins: game.roundWins, gridVersion: game.gridVersion });
    });

    socket.on('start_daw', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.phase !== 'GAME_OVER' || playerId !== game.hostPlayerId) return;
      const winnerTeam: TeamColor = game.roundWins.RED >= ROUNDS_TO_WIN ? 'RED' : 'GREEN';
      const allQuestions: QuestionData[] = [];
      for (const qs of game.questionsByLetter.values()) allQuestions.push(...qs);
      const dawState = createDawState(winnerTeam, allQuestions, () => endDaw(io, roomCode));
      game.dawState = dawState; game.phase = 'DAIRAT_AL_DAW';
      io.to(roomCode).emit('daw_start', { winnerTeam, endTime: dawState.endTime });
      const q = getCurrentDawQuestion(dawState);
      if (q) io.to(roomCode).emit('daw_question', { text: q.text, options: q.options, index: 0 });
      else endDaw(io, roomCode);
    });

    socket.on('daw_judge', ({ roomCode, correct }: { roomCode: string; correct: boolean }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.phase !== 'DAIRAT_AL_DAW' || playerId !== game.hostPlayerId || !game.dawState) return;
      io.to(roomCode).emit('daw_result', { correct });
      const next = advanceDaw(game.dawState, correct);
      if (next) io.to(roomCode).emit('daw_question', { text: next.text, options: next.options, index: game.dawState.currentIndex });
      else endDaw(io, roomCode);
    });

    // ─── Host Commands ─────────────────────────────────────────

    socket.on('host_pause', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.isPaused || game.hostPlayerId !== playerId) return;
      const timedPhases: GamePhase[] = ['ANSWERING', 'BUZZER_OPEN', 'BUZZER', 'BUZZER_SECOND_CHANCE'];
      if (!timedPhases.includes(game.phase)) return;
      game.isPaused = true;
      game.pausedAt = Date.now();
      game.pausedTimeRemaining = game.activeQuestion?.endTime
        ? Math.max(1000, game.activeQuestion.endTime - Date.now())
        : 30000;
      if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
      io.to(roomCode).emit('game_paused', {});
    });

    socket.on('host_resume', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || !game.isPaused || game.hostPlayerId !== playerId) return;
      game.isPaused = false;
      const remaining = game.pausedTimeRemaining;
      const newEndTime = Date.now() + remaining;
      if (game.activeQuestion) game.activeQuestion.endTime = newEndTime;
      game.pausedAt = null;
      game.pausedTimeRemaining = 0;
      if (game.phase === 'ANSWERING') {
        game.questionTimer = setTimeout(() => handleBuzzerAnswerTimeout(io, roomCode), remaining);
      } else if (game.phase === 'BUZZER_OPEN') {
        game.questionTimer = setTimeout(() => handleBuzzerOpenTimeout(io, roomCode), remaining);
      } else if (game.phase === 'BUZZER' || game.phase === 'BUZZER_SECOND_CHANCE') {
        game.questionTimer = setTimeout(() => handleBuzzerTimeout(io, roomCode), remaining);
      }
      io.to(roomCode).emit('game_resumed', { endTime: newEndTime });
    });

    socket.on('host_skip_cell', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.hostPlayerId !== playerId || !game.selectedCell) return;
      if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
      game.isPaused = false; game.pausedTimeRemaining = 0; game.pausedAt = null;
      game.currentTeam = otherTeam(game.currentTeam);
      game.phase = 'CELL_SELECTION';
      game.selectedCell = null; game.activeQuestion = null; game.answerLocked = false;
      game.buzzerTeam = null; game.buzzerPlayerId = null; game.buzzerLockedTeams = new Set();
      io.to(roomCode).emit('phase_change', { phase: 'CELL_SELECTION', currentTeam: game.currentTeam });
    });

    socket.on('host_undo_buzz', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.hostPlayerId !== playerId || game.phase !== 'ANSWERING') return;
      if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
      const undoneTeam = game.buzzerTeam;
      game.phase = 'BUZZER';
      game.buzzerTeam = null; game.buzzerLockedTeams = new Set(); game.buzzerPlayerId = null;
      game.answerLocked = false; game.isPaused = false; game.pausedTimeRemaining = 0;
      if (game.activeQuestion) game.activeQuestion.endTime = 0;
      game.questionTimer = setTimeout(() => handleBuzzerTimeout(io, roomCode), 30000);
      io.to(roomCode).emit('buzz_cancelled', { undoneTeam });
      io.to(roomCode).emit('phase_change', { phase: 'BUZZER', currentTeam: game.currentTeam });
    });

    socket.on('host_force_cell_owner', ({ roomCode, col, row, owner }: {
      roomCode: string; col: number; row: number; owner: TeamColor | null;
    }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.hostPlayerId !== playerId) return;
      const key = cellKey(col, row);
      const cell = game.grid.get(key);
      if (!cell) return;
      cell.owner = owner;
      cell.isGolden = (owner !== null && game.goldenCellKey === key) ? true : undefined;
      game.gridVersion++;
      io.to(roomCode).emit('cell_claimed', { col, row, owner: cell.owner, gridVersion: game.gridVersion, isGolden: cell.isGolden ?? false });
      if (owner) {
        const winnerTeam = owner as TeamColor;
        if (checkWin(game.grid, winnerTeam)) {
          game.winningPath = getWinningPath(game.grid, winnerTeam);
          game.roundWins[winnerTeam]++;
          if (game.roundWins[winnerTeam] >= ROUNDS_TO_WIN) {
            game.phase = 'GAME_OVER';
            io.to(roomCode).emit('game_over', { winner: winnerTeam, roundWins: game.roundWins, winningPath: game.winningPath, leaderboard: buildLeaderboard(game) });
          } else {
            game.phase = 'ROUND_OVER';
            io.to(roomCode).emit('round_over', { winner: winnerTeam, roundWins: game.roundWins, winningPath: game.winningPath, leaderboard: buildLeaderboard(game) });
          }
        }
      }
    });

    socket.on('host_toggle_away_mode', ({ roomCode, targetPlayerId }: { roomCode: string; targetPlayerId: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.hostPlayerId !== playerId) return;
      const target = game.players.get(targetPlayerId);
      if (!target) return;
      target.status = target.status === 'away' ? 'active' : 'away';
      io.to(roomCode).emit('player_status_changed', { playerId: targetPlayerId, status: target.status, players: buildPlayersPayload(game) });
    });

    socket.on('host_kick_player', ({ roomCode, targetPlayerId }: { roomCode: string; targetPlayerId: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.hostPlayerId !== playerId || targetPlayerId === playerId) return;
      const targetSocketId = game.players.get(targetPlayerId)?.socketId;
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) { targetSocket.emit('kicked', { message: 'تم طردك من الغرفة' }); targetSocket.disconnect(); }
      }
      game.redTeam.delete(targetPlayerId);
      game.greenTeam.delete(targetPlayerId);
      const ps = game.players.get(targetPlayerId);
      if (ps) ps.isConnected = false;
      io.to(roomCode).emit('player_update', { players: buildPlayersPayload(game) });
    });

    socket.on('host_adjust_score', ({ roomCode, team, delta }: { roomCode: string; team: TeamColor; delta: number }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game || game.hostPlayerId !== playerId) return;
      game.roundWins[team] = Math.max(0, (game.roundWins[team] || 0) + delta);
      io.to(roomCode).emit('score_adjusted', { roundWins: game.roundWins });
    });

    socket.on('disconnect', async () => {
      try {
        const playerId = socket.data.playerId as string | undefined;
        const roomCode = socket.data.roomCode as string | undefined;
        if (!playerId || !roomCode) return;
        await prisma.player.update({ where: { id: playerId }, data: { isConnected: false, socketId: null } });
        const game = activeGames.get(roomCode);
        if (game) {
          const ps = game.players.get(playerId);
          if (ps) { ps.isConnected = false; ps.socketId = null; }
          if (game.phase === 'ANSWERING') {
            const answeringTeam = game.buzzerTeam ?? game.currentTeam;
            if (getConnectedTeamMembers(game, answeringTeam).length === 0) {
              if (game.questionTimer) clearTimeout(game.questionTimer);
              game.questionTimer = null;
              // Move to BUZZER_SECOND_CHANCE for the other team if available
              const otherT = otherTeam(answeringTeam);
              if (!game.buzzerLockedTeams.has(otherT)) {
                game.phase = 'BUZZER_SECOND_CHANCE';
                game.answerLocked = false;
                io.to(roomCode).emit('phase_change', { phase: game.phase, currentTeam: game.currentTeam });
                io.to(roomCode).emit('answer_wrong_team', { wrongTeam: answeringTeam, playerName: '' });
                game.questionTimer = setTimeout(() => {
                  const g = activeGames.get(roomCode);
                  if (!g || g.phase !== 'BUZZER_SECOND_CHANCE') return;
                  releaseCellAndChangeTurn(io, roomCode, g, g.activeQuestion?.correctIndex ?? -1);
                }, 10000);
              } else {
                handleQuestionTimeout(io, roomCode);
              }
            }
          }
        }
        // انقل لقب المقدم فقط في غرفة الانتظار — أثناء اللعب لا ننقل المقدم لأن كل المتصلين لديهم فرق
        const currentSession = await prisma.gameSession.findUnique({ where: { code: roomCode }, select: { hostId: true, status: true } });
        if (currentSession?.hostId === playerId && currentSession.status === 'WAITING') {
          const transferTimeout = setTimeout(async () => {
            pendingHostTransfers.delete(playerId);
            try {
              const freshSession = await prisma.gameSession.findUnique({
                where: { code: roomCode },
                include: { players: { where: { isConnected: true }, orderBy: { joinOrder: 'asc' } } },
              });
              if (!freshSession || freshSession.hostId !== playerId || freshSession.players.length === 0) return;
              const newHost = freshSession.players[0];
              await prisma.gameSession.update({ where: { id: freshSession.id }, data: { hostId: newHost.id } });
              const g = activeGames.get(roomCode);
              if (g) g.hostPlayerId = newHost.id;
              const newHostSocket = [...io.sockets.sockets.values()].find(s => s.data.playerId === newHost.id);
              if (newHostSocket) newHostSocket.emit('host_changed', { newHostId: newHost.id });
              const allPlayers = await prisma.player.findMany({ where: { session: { code: roomCode } }, orderBy: { joinOrder: 'asc' } });
              io.to(roomCode).emit('player_update', { players: allPlayers.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected, team: (p as any).team ?? null, joinOrder: p.joinOrder })) });
            } catch (err) { console.error('delayed host transfer error:', err); }
          }, 5000);
          pendingHostTransfers.set(playerId, transferTimeout);
        }
        const allPlayers = await prisma.player.findMany({ where: { session: { code: roomCode } }, orderBy: { joinOrder: 'asc' } });
        io.to(roomCode).emit('player_update', { players: allPlayers.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected, team: (p as any).team ?? null, joinOrder: p.joinOrder })) });
      } catch (err) { console.error('disconnect error:', err); }
    });

  });

  function releaseCellAndChangeTurn(io: Server, roomCode: string, game: HexGameState, correctIndex: number) {
    if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
    // When no one answered correctly, alternate turns (no winner to reward)
    game.currentTeam = otherTeam(game.currentTeam);
    game.phase = 'CELL_SELECTION';
    game.selectedCell = null;
    game.activeQuestion = null;
    game.answerLocked = false;
    game.buzzerTeam = null;
    game.buzzerPlayerId = null;
    game.buzzerLockedTeams = new Set();
    io.to(roomCode).emit('answer_timeout', { correctIndex, currentTeam: game.currentTeam });
  }

  function buildLeaderboard(game: HexGameState) {
    const players = [...game.players.values()]
      .filter(p => p.id !== game.hostPlayerId)
      .sort((a, b) => {
        if (b.stats.correct !== a.stats.correct) return b.stats.correct - a.stats.correct;
        if (a.stats.wrong !== b.stats.wrong) return a.stats.wrong - b.stats.wrong;
        const avgA = a.stats.correct > 0 ? a.stats.totalTimeMs / a.stats.correct : Infinity;
        const avgB = b.stats.correct > 0 ? b.stats.totalTimeMs / b.stats.correct : Infinity;
        return avgA - avgB;
      })
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        name: p.name,
        team: p.team,
        correct: p.stats.correct,
        wrong: p.stats.wrong,
        buzzes: p.stats.buzzes,
        goldenWins: p.stats.goldenWins,
        avgTimeMs: p.stats.correct > 0 ? Math.round(p.stats.totalTimeMs / p.stats.correct) : 0,
      }));
    const fastestPlayer = [...game.players.values()]
      .filter(p => p.id !== game.hostPlayerId && p.stats.correct > 0)
      .sort((a, b) => (a.stats.totalTimeMs / a.stats.correct) - (b.stats.totalTimeMs / b.stats.correct))[0];
    return {
      players,
      fastestPlayer: fastestPlayer
        ? { name: fastestPlayer.name, avgTimeMs: Math.round(fastestPlayer.stats.totalTimeMs / fastestPlayer.stats.correct) }
        : null,
    };
  }

  function handleBuzzerTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || (game.phase !== 'BUZZER' && game.phase !== 'BUZZER_SECOND_CHANCE')) return;
    // No one buzzed — reveal answer to everyone, then after 3s move to next
    const correctIndex = game.activeQuestion?.correctIndex ?? -1;
    game.answerLocked = true;
    io.to(roomCode).emit('answer_revealed_no_buzz', { correctIndex });
    game.questionTimer = setTimeout(() => {
      const g = activeGames.get(roomCode);
      if (!g) return;
      releaseCellAndChangeTurn(io, roomCode, g, correctIndex);
    }, 3000);
  }

  // Called when ANSWERING timer (10s) expires after buzz_in
  function handleBuzzerAnswerTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || game.phase !== 'ANSWERING') return;
    const failedTeam = game.buzzerTeam!;
    const otherT = otherTeam(failedTeam);
    if (!game.buzzerLockedTeams.has(otherT)) {
      // Give the other team BUZZER_OPEN (5s gradual reveal + 30s answer)
      game.phase = 'BUZZER_OPEN';
      game.answerLocked = false;
      game.currentQuestionStartTime = Date.now();
      const openEndTime = Date.now() + BUZZER_OPEN_TOTAL_MS;
      game.activeQuestion!.endTime = openEndTime;
      game.questionTimer = setTimeout(() => handleBuzzerOpenTimeout(io, roomCode), BUZZER_OPEN_TOTAL_MS);
      io.to(roomCode).emit('answer_wrong_team', { wrongTeam: failedTeam, playerName: '' });
      io.to(roomCode).emit('phase_change', {
        phase: game.phase, currentTeam: game.currentTeam,
        answeringTeam: otherT, timeLimit: BUZZER_OPEN_MS / 1000, endTime: openEndTime,
      });
    } else {
      releaseCellAndChangeTurn(io, roomCode, game, game.activeQuestion?.correctIndex ?? -1);
    }
  }

  // Called when BUZZER_OPEN timer expires — no one answered, reveal answer, pass turn
  function handleBuzzerOpenTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || game.phase !== 'BUZZER_OPEN') return;
    const correctIndex = game.activeQuestion?.correctIndex ?? -1;
    if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
    const nextTeam = otherTeam(game.currentTeam);
    game.currentTeam = nextTeam;
    game.phase = 'CELL_SELECTION';
    game.selectedCell = null; game.activeQuestion = null; game.answerLocked = false;
    game.buzzerTeam = null; game.buzzerPlayerId = null; game.buzzerLockedTeams = new Set();
    io.to(roomCode).emit('buzzer_open_no_answer', { correctIndex, currentTeam: nextTeam });
  }

  function handleQuestionTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || game.phase !== 'ANSWERING') return;

    const answeringTeam = game.buzzerTeam ?? game.currentTeam;
    const otherT = otherTeam(answeringTeam);
    const otherAlreadyUsed = game.buzzerLockedTeams.has(otherT);

    if (!otherAlreadyUsed) {
      // Give the other team a second chance
      game.phase = 'BUZZER_SECOND_CHANCE';
      game.answerLocked = false;
      io.to(roomCode).emit('answer_wrong_team', { wrongTeam: answeringTeam, playerName: '' });
      io.to(roomCode).emit('phase_change', { phase: game.phase, currentTeam: game.currentTeam });
      game.questionTimer = setTimeout(() => {
        const g = activeGames.get(roomCode);
        if (!g || g.phase !== 'BUZZER_SECOND_CHANCE') return;
        releaseCellAndChangeTurn(io, roomCode, g, g.activeQuestion?.correctIndex ?? -1);
      }, 10000);
    } else {
      releaseCellAndChangeTurn(io, roomCode, game, game.activeQuestion?.correctIndex ?? -1);
    }
  }

  function handleTiebreakerTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || game.phase !== 'TIEBREAKER') return;
    // No one buzzed on tiebreaker — pick randomly
    const coin: TeamColor = Math.random() < 0.5 ? 'RED' : 'GREEN';
    game.answerLocked = true;
    io.to(roomCode).emit('answer_revealed_no_buzz', { correctIndex: game.activeQuestion?.correctIndex ?? -1 });
    game.questionTimer = setTimeout(() => {
      const g = activeGames.get(roomCode);
      if (!g) return;
      io.to(roomCode).emit('tiebreaker_end', { winnerTeam: coin, correctIndex: g.activeQuestion?.correctIndex ?? -1, randomPick: true });
      setTimeout(() => {
        const g2 = activeGames.get(roomCode);
        if (!g2) return;
        g2.phase = 'CELL_SELECTION'; g2.currentTeam = coin;
        g2.activeQuestion = null; g2.buzzerTeam = null; g2.buzzerLockedTeams = new Set();
        g2.buzzerPlayerId = null; g2.answerLocked = false;
        io.to(roomCode).emit('phase_change', { phase: 'CELL_SELECTION', currentTeam: coin });
      }, ANSWER_REVEAL_MS);
    }, 3000);
  }

  function handleTiebreakerAnswerTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || game.phase !== 'ANSWERING' || !game.buzzerTeam) return;
    // Check if this was a tiebreaker (no selectedCell)
    if (game.selectedCell) return; // not a tiebreaker
    const failedTeam = game.buzzerTeam;
    const otherT = otherTeam(failedTeam);
    if (!game.buzzerLockedTeams.has(otherT)) {
      game.phase = 'TIEBREAKER';
      game.answerLocked = false;
      game.buzzerTeam = null; game.buzzerPlayerId = null;
      const endTime = Date.now() + BUZZER_TOTAL_MS;
      game.activeQuestion!.endTime = endTime;
      game.questionTimer = setTimeout(() => handleTiebreakerTimeout(io, roomCode), BUZZER_TOTAL_MS);
      io.to(roomCode).emit('tiebreaker_wrong', { wrongTeam: failedTeam, correctIndex: -1 });
    } else {
      // Both missed — random pick
      const coin: TeamColor = Math.random() < 0.5 ? 'RED' : 'GREEN';
      io.to(roomCode).emit('tiebreaker_end', { winnerTeam: coin, correctIndex: game.activeQuestion?.correctIndex ?? -1, randomPick: true });
      setTimeout(() => {
        const g = activeGames.get(roomCode);
        if (!g) return;
        g.phase = 'CELL_SELECTION'; g.currentTeam = coin;
        g.activeQuestion = null; g.buzzerTeam = null; g.buzzerLockedTeams = new Set();
        g.buzzerPlayerId = null; g.answerLocked = false;
        io.to(roomCode).emit('phase_change', { phase: 'CELL_SELECTION', currentTeam: coin });
      }, ANSWER_REVEAL_MS);
    }
  }

  function endDaw(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || !game.dawState) return;
    const { score, total } = game.dawState;
    clearDawTimeout(game.dawState);
    game.dawState = null; game.phase = 'GAME_OVER';
    io.to(roomCode).emit('daw_end', { score, total });
  }
}