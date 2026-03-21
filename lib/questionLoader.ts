/**
 * questionLoader.ts
 * Loads questions from the database grouped by Arabic letter.
 * Called once at game start — results are cached in HexGameState.questionsByLetter.
 */

import { prisma } from './prisma';

export interface QuestionData {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
}

/**
 * Loads all active questions from DB, grouped by their letter (category field).
 * Returns a Map<letter, QuestionData[]>.
 *
 * Shuffle is applied per-letter so each game starts with a different question order.
 * Call this once at game_start and store result in HexGameState.questionsByLetter.
 */
export async function loadQuestionsByLetter(): Promise<Map<string, QuestionData[]>> {
  const rows = await prisma.questionBank.findMany({
    where: { isActive: true },
    select: { id: true, text: true, options: true, correctIndex: true, category: true },
  });

  const map = new Map<string, QuestionData[]>();

  for (const row of rows) {
    const letter = row.category;
    if (!map.has(letter)) map.set(letter, []);
    map.get(letter)!.push({
      id: row.id,
      text: row.text,
      options: row.options as string[],
      correctIndex: row.correctIndex,
    });
  }

  // Shuffle each letter's questions independently (Fisher-Yates)
  for (const questions of map.values()) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }

  return map;
}

/**
 * Returns a question for the given letter that hasn't been used yet.
 * Mutates `usedIds` by adding the selected question's id.
 * Returns null if all questions for the letter are exhausted
 * (extremely unlikely in a 121-cell game with 480 questions).
 */
export function pickQuestion(
  letter: string,
  questionsByLetter: Map<string, QuestionData[]>,
  usedIds: Set<number>
): QuestionData | null {
  const pool = questionsByLetter.get(letter);
  if (!pool) return null;

  const available = pool.filter(q => !usedIds.has(q.id));
  if (available.length === 0) {
    // All questions for this letter used — allow reuse as fallback
    const fallback = pool[Math.floor(Math.random() * pool.length)];
    return fallback ?? null;
  }

  const question = available[0]; // already shuffled at load time → just take first
  usedIds.add(question.id);
  return question;
}

/**
 * Returns all unique letters present in the loaded questions.
 * Used by initGrid() to know which letters to place on the board.
 */
export function getAvailableLetters(questionsByLetter: Map<string, QuestionData[]>): string[] {
  return [...questionsByLetter.keys()];
}
