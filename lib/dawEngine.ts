/**
 * dawEngine.ts
 * Logic for "دائرة الضوء" (Dairat Al-Daw) — the final 60-second rapid-fire round.
 *
 * The captain reads questions aloud and presses ✅ (correct) or ❌ (wrong).
 * The server tracks score and time; the client only renders what the server emits.
 *
 * Usage in gameEngine.ts:
 *   import { createDawState, DawState, DAW_DURATION_MS } from './dawEngine';
 *
 *   on('start_daw'):
 *     game.dawState = createDawState(winnerTeam, questions, io, roomCode);
 *     io.to(roomCode).emit('daw_start', { winnerTeam, endTime: game.dawState.endTime });
 *     emitNextDawQuestion(game, io, roomCode);
 *
 *   on('daw_judge', { correct }):
 *     handleDawJudge(game, correct, io, roomCode);
 */

import type { Server, Socket } from 'socket.io';
import type { QuestionData } from './questionLoader';
import type { TeamColor } from './hexUtils';

export const DAW_DURATION_MS = 60_000; // 60 seconds

export interface DawState {
  winnerTeam: TeamColor;
  endTime: number;              // Date.now() + DAW_DURATION_MS
  timeoutHandle: NodeJS.Timeout;
  questions: QuestionData[];    // remaining questions (shuffled pool)
  currentIndex: number;
  score: number;                // correct answers so far
  total: number;                // questions judged so far
}

/**
 * Builds initial DawState.
 * The caller is responsible for starting the timer via the returned timeoutHandle.
 */
export function createDawState(
  winnerTeam: TeamColor,
  questions: QuestionData[],
  onTimeout: () => void
): DawState {
  // Shuffle questions for the daw round
  const pool = [...questions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const endTime = Date.now() + DAW_DURATION_MS;
  const timeoutHandle = setTimeout(onTimeout, DAW_DURATION_MS);

  return {
    winnerTeam,
    endTime,
    timeoutHandle,
    questions: pool,
    currentIndex: 0,
    score: 0,
    total: 0,
  };
}

/** Returns the current question for display, or null if pool is exhausted. */
export function getCurrentDawQuestion(state: DawState): QuestionData | null {
  return state.questions[state.currentIndex] ?? null;
}

/**
 * Advances the daw round after a judge decision.
 * Returns the new current question (after advancing index), or null if done.
 */
export function advanceDaw(state: DawState, correct: boolean): QuestionData | null {
  if (correct) state.score++;
  state.total++;
  state.currentIndex++;
  return getCurrentDawQuestion(state);
}

/** Cleans up the timeout — call when daw ends normally or game is cleaned up. */
export function clearDawTimeout(state: DawState): void {
  clearTimeout(state.timeoutHandle);
}
