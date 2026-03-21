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
const BUZZER_OPEN_MS   = 30000;   // 30 seconds for the other team (open phase)
const ROUNDS_TO_WIN = 3;
const ANSWER_REVEAL_MS = 1500;

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
  | 'DAIRAT_AL_DAW';

interface PlayerState {
  id: string;
  name: string;
  joinOrder: number;
  isConnected: boolean;
  socketId: string | null;
  team: TeamColor | null;
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
}

// ─── In-memory state ──────────────────────────────────────────
const activeGames = new Map<string, HexGameState>();

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
        const isHost = updatedSession!.hostId === player.id;
        const game = activeGames.get(roomCode);
        const playersData = updatedSession!.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected, team: (p as any).team ?? null, joinOrder: p.joinOrder }));

        socket.emit('room_joined', { playerId: player.id, isHost, players: playersData, gameStatus: session.status, phase: game?.phase ?? null });

        if (isReconnect && game) {
          const isBuzzerPhase = game.phase === 'BUZZER' || game.phase === 'BUZZER_SECOND_CHANCE';
          socket.emit('grid_sync', {
            grid: buildGridArray(game), gridVersion: game.gridVersion, phase: game.phase,
            currentTeam: game.currentTeam, currentRound: game.currentRound, roundWins: game.roundWins, winningPath: game.winningPath,
            activeQuestion: (game.phase === 'ANSWERING' && game.activeQuestion)
              ? { letter: game.activeQuestion.letter, text: game.activeQuestion.text, options: game.activeQuestion.options, endTime: game.activeQuestion.endTime, col: game.selectedCell?.col, row: game.selectedCell?.row }
              : (isBuzzerPhase && game.activeQuestion)
              ? { letter: game.activeQuestion.letter, text: game.activeQuestion.text, options: game.activeQuestion.options, col: game.selectedCell?.col, row: game.selectedCell?.row }
              : null,
            buzzerTeam: game.buzzerTeam,
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
        if (session.hostId !== playerId) { socket.emit('error', { message: 'فقط الكابتن يمكنه بدء اللعبة' }); return; }

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
          stats: { correct: 0, wrong: 0, buzzes: 0, totalTimeMs: 0, goldenWins: 0 },
        });

        const initialGrid = initGrid(letters);
        const initialKeys = [...initialGrid.keys()];
        const goldenCellKey = initialKeys[Math.floor(Math.random() * initialKeys.length)];

        const game: HexGameState = {
          sessionId: session.id, hostPlayerId: session.hostId!,
          phase: 'CELL_SELECTION', currentRound: 1, roundWins: { RED: 0, GREEN: 0 }, currentTeam: 'RED',
          grid: initialGrid, gridVersion: 0,
          redTeam: new Set(redPlayers.map(p => p.id)), greenTeam: new Set(greenPlayers.map(p => p.id)),
          selectedCell: null, activeQuestion: null, answerLocked: false, questionTimer: null,
          questionsByLetter, usedQuestions: new Set(), players, winningPath: null, dawState: null,
          buzzerTeam: null, buzzerLockedTeams: new Set(),
          buzzerPlayerId: null, goldenCellKey, currentQuestionStartTime: 0,
        };
        activeGames.set(roomCode, game);
        await prisma.gameSession.update({ where: { id: session.id }, data: { status: 'PLAYING' } });
        io.to(roomCode).emit('game_start', { phase: game.phase, grid: buildGridArray(game), currentTeam: game.currentTeam, round: game.currentRound, roundWins: game.roundWins, gridVersion: game.gridVersion, players: buildPlayersPayload(game) });
      } catch (err) { console.error('start_game error:', err); socket.emit('error', { message: 'حدث خطأ أثناء بدء اللعبة' }); }
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

      // Transition to BUZZER phase — no timer yet, waiting for buzz_in
      game.phase = 'BUZZER';
      game.selectedCell = { col, row };
      game.answerLocked = false;
      game.buzzerTeam = null;
      game.buzzerLockedTeams = new Set();
      game.buzzerPlayerId = null;
      game.activeQuestion = { id: question.id, letter: cell.letter, text: question.text, options: question.options, correctIndex: question.correctIndex, endTime: 0 };

      // Safety timeout: if no one buzzes in 30s, release cell and change turn
      if (game.questionTimer) clearTimeout(game.questionTimer);
      game.questionTimer = setTimeout(() => handleBuzzerTimeout(io, roomCode), 30000);

      const isGoldenCell = game.goldenCellKey === key;
      io.to(roomCode).emit('cell_selected', { col, row, letter: cell.letter, team: game.currentTeam });
      if (isGoldenCell) {
        io.to(roomCode).emit('cell_is_golden', { col, row, letter: cell.letter });
      }
      io.to(roomCode).emit('buzzer_started', { letter: cell.letter, text: question.text, options: question.options, col, row });
    });

    socket.on('buzz_in', ({ roomCode }: { roomCode: string }) => {
      const playerId = socket.data.playerId as string;
      const game = activeGames.get(roomCode);
      if (!game) return;
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
        // Lock immediately to prevent further submissions from this team
        game.answerLocked = true;
        if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }

        const playerState = game.players.get(playerId);
        if (playerState) playerState.stats.wrong++;
        const otherT = otherTeam(answeringTeam);
        const otherAlreadyUsed = game.buzzerLockedTeams.has(otherT) || game.phase === 'BUZZER_OPEN';

        if (!otherAlreadyUsed) {
          // Wrong in ANSWERING — give the other team BUZZER_OPEN (direct answer, 30s)
          game.phase = 'BUZZER_OPEN';
          game.answerLocked = false;
          game.currentQuestionStartTime = Date.now();
          const openEndTime = Date.now() + BUZZER_OPEN_MS;
          game.activeQuestion!.endTime = openEndTime;
          game.questionTimer = setTimeout(() => {
            const g = activeGames.get(roomCode);
            if (!g || g.phase !== 'BUZZER_OPEN') return;
            releaseCellAndChangeTurn(io, roomCode, g, g.activeQuestion?.correctIndex ?? -1);
          }, BUZZER_OPEN_MS);
          io.to(roomCode).emit('answer_wrong_team', { wrongTeam: answeringTeam, playerName: playerState?.name ?? '' });
          io.to(roomCode).emit('phase_change', {
            phase: game.phase, currentTeam: game.currentTeam,
            answeringTeam: otherT, timeLimit: BUZZER_OPEN_MS / 1000, endTime: openEndTime,
          });
        } else {
          // Both teams have had their chance — release cell and change turn
          io.to(roomCode).emit('answer_wrong_team', { wrongTeam: answeringTeam, playerName: playerState?.name ?? '' });
          releaseCellAndChangeTurn(io, roomCode, game, game.activeQuestion.correctIndex);
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
          g.currentTeam = otherTeam(g.currentTeam);
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
        const session = await prisma.gameSession.findUnique({ where: { code: roomCode }, include: { players: { where: { isConnected: true }, orderBy: { joinOrder: 'asc' } } } });
        if (session?.hostId === playerId && session.players.length > 0) {
          const newHost = session.players[0];
          await prisma.gameSession.update({ where: { id: session.id }, data: { hostId: newHost.id } });
          if (game) game.hostPlayerId = newHost.id;
          const newHostSocket = [...io.sockets.sockets.values()].find(s => s.data.playerId === newHost.id);
          if (newHostSocket) newHostSocket.emit('host_changed', { newHostId: newHost.id });
        }
        const allPlayers = await prisma.player.findMany({ where: { session: { code: roomCode } }, orderBy: { joinOrder: 'asc' } });
        io.to(roomCode).emit('player_update', { players: allPlayers.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected, team: (p as any).team ?? null, joinOrder: p.joinOrder })) });
      } catch (err) { console.error('disconnect error:', err); }
    });

  });

  function releaseCellAndChangeTurn(io: Server, roomCode: string, game: HexGameState, correctIndex: number) {
    if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
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
    releaseCellAndChangeTurn(io, roomCode, game, game.activeQuestion?.correctIndex ?? -1);
  }

  // Called when ANSWERING timer (10s) expires after buzz_in
  function handleBuzzerAnswerTimeout(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || game.phase !== 'ANSWERING') return;
    const failedTeam = game.buzzerTeam!;
    const otherT = otherTeam(failedTeam);
    if (!game.buzzerLockedTeams.has(otherT)) {
      // Give the other team BUZZER_OPEN (30s direct answer)
      game.phase = 'BUZZER_OPEN';
      game.answerLocked = false;
      game.currentQuestionStartTime = Date.now();
      const openEndTime = Date.now() + BUZZER_OPEN_MS;
      game.activeQuestion!.endTime = openEndTime;
      game.questionTimer = setTimeout(() => {
        const g = activeGames.get(roomCode);
        if (!g || g.phase !== 'BUZZER_OPEN') return;
        releaseCellAndChangeTurn(io, roomCode, g, g.activeQuestion?.correctIndex ?? -1);
      }, BUZZER_OPEN_MS);
      io.to(roomCode).emit('answer_wrong_team', { wrongTeam: failedTeam, playerName: '' });
      io.to(roomCode).emit('phase_change', {
        phase: game.phase, currentTeam: game.currentTeam,
        answeringTeam: otherT, timeLimit: BUZZER_OPEN_MS / 1000, endTime: openEndTime,
      });
    } else {
      releaseCellAndChangeTurn(io, roomCode, game, game.activeQuestion?.correctIndex ?? -1);
    }
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

  function endDaw(io: Server, roomCode: string) {
    const game = activeGames.get(roomCode);
    if (!game || !game.dawState) return;
    const { score, total } = game.dawState;
    clearDawTimeout(game.dawState);
    game.dawState = null; game.phase = 'GAME_OVER';
    io.to(roomCode).emit('daw_end', { score, total });
  }
}