import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── Types ─────────────────────────────────────────────────────────────────

interface ParsedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  letter: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Strip [cite_start] and [cite: N] noise from AI-generated text (preserves leading whitespace) */
function cleanCite(s: string): string {
  return s.replace(/\[cite_start\]/g, '').replace(/\[cite:\s*[\d,\s]*\]/g, '').trimEnd();
}

/** Strip bold markers **...** */
function stripBold(s: string): string {
  return s.replace(/\*\*/g, '').trim();
}

// ─── Parser ────────────────────────────────────────────────────────────────

function parseQuestionsFile(filePath: string): ParsedQuestion[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const results: ParsedQuestion[] = [];

  // Track seen letters to skip duplicates
  const letterQuestionCount = new Map<string, number>();
  let currentLetter = '';
  let isDuplicate = false;

  // Temp state for building a question
  let questionText = '';
  let options: string[] = [];

  function flush() {
    if (!questionText || options.length < 2 || isDuplicate) {
      questionText = '';
      options = [];
      return;
    }
    const ci = options.findIndex(o => o.includes('(الإجابة الصحيحة)'));
    if (ci === -1) {
      questionText = '';
      options = [];
      return;
    }
    const cleanOptions = options.map(o =>
      o.replace(/\s*\(الإجابة الصحيحة\)\s*/, '').trim()
    );
    results.push({
      text: questionText.trim(),
      options: cleanOptions,
      correctIndex: ci,
      letter: currentLetter,
    });
    const count = (letterQuestionCount.get(currentLetter) || 0) + 1;
    letterQuestionCount.set(currentLetter, count);
    questionText = '';
    options = [];
  }

  // Regex patterns
  const headerRe = /^##\s*مسابقة حرف\s*\(\s*(.+?)\s*\)/;
  const patternA_Q = /^\*\*س\d+:\s*(.+?)\*\*\s*$/;       // **سN: question?**
  const patternA_Opt = /^\*\s+(.+)/;                       // * option
  const patternB_Q = /^\*\s+(.+[؟?])\s*$/;                 // * question? (plain)
  const patternB_Q_Bold = /^\*\s+\*\*(.+?)\*\*\s*$/;       // * **question?**
  const patternB_Opt_ABGD = /^\s*[أبجد]\)\s*(.+)/;         // أ) option
  const patternB_Opt_Dash = /^\s*-\s+(.+)/;                  // - option (indented)
  const patternC_Q = /^(?!\d+\.)(.+[؟?])\s*$/;             // question ending with ?
  const patternC_Opt = /^\d+\.\s*(.+)/;                     // 1. option
  const patternD_Q = /^\d+\.\s*(.+[؟?])\s*$/;              // N. question?
  const patternD_Opt = /^-\s+(.+)/;                         // - option
  const patternE_Marker = /^س[\d٠-٩]+\s*$/;                // سN (standalone)
  const patternE_Opt = /^[أبجد]\)\s*(.+)/;                  // أ) option
  const patternF_Sep = /^\*{3}\s*$/;                         // ***
  const patternF_Q = /^\*\*س[٠-٩0-9]+:\s*(.+?)\*\*\s*$/;  // **سN: question?**
  const patternF_Opt = /^[أبجد]\)\s*(.+)/;                  // أ) option

  // Determine which pattern group applies based on the letter
  type PatternGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  const letterPatterns: Record<string, PatternGroup> = {};
  for (const l of ['أ', 'ب', 'ت']) letterPatterns[l] = 'A';
  for (const l of ['ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ'])
    letterPatterns[l] = 'B';
  for (const l of ['ف', 'ق', 'ك', 'ل', 'م']) letterPatterns[l] = 'C';
  for (const l of ['ع', 'غ']) letterPatterns[l] = 'D';
  for (const l of ['ن', 'هـ']) letterPatterns[l] = 'E';
  for (const l of ['و', 'ي']) letterPatterns[l] = 'F';

  let patternGroup: PatternGroup | '' = '';
  let expectQuestionNextLine = false; // for pattern E after سN marker

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = cleanCite(raw);

    // ── Section header ──
    const hm = line.match(headerRe);
    if (hm) {
      flush();
      const letter = hm[1].trim();

      // Check for duplicate section — skip if we already have questions for this letter
      const prevCount = letterQuestionCount.get(letter) || 0;
      if (prevCount > 0) {
        isDuplicate = true;
      } else {
        isDuplicate = false;
        currentLetter = letter;
        patternGroup = letterPatterns[letter] || '';
      }
      expectQuestionNextLine = false;
      continue;
    }

    if (isDuplicate || !currentLetter) continue;

    const trimmed = line.trim();

    // Skip junk / AI commentary lines
    if (trimmed.startsWith('---')) { flush(); continue; }
    if (trimmed === '') { continue; }

    // ── Pattern A ──
    if (patternGroup === 'A') {
      const qm = line.match(patternA_Q);
      if (qm) {
        flush();
        questionText = cleanCite(stripBold(qm[1])).replace(/\s*[؟?]\s*$/, '؟');
        continue;
      }
      const om = line.match(patternA_Opt);
      if (om && questionText) {
        options.push(cleanCite(om[1]));
        continue;
      }
    }

    // ── Pattern B ──
    if (patternGroup === 'B') {
      // Question line: * **question?** or * question?
      const qmBold = line.match(patternB_Q_Bold);
      const qmPlain = !qmBold ? line.match(patternB_Q) : null;
      if (qmBold || qmPlain) {
        flush();
        const qText = qmBold ? qmBold[1] : qmPlain![1];
        questionText = cleanCite(stripBold(qText)).replace(/\s*[؟?]\s*$/, '؟');
        continue;
      }
      // Option line: أ) ... or indented - ...
      const omABGD = line.match(patternB_Opt_ABGD);
      if (omABGD && questionText) {
        options.push(cleanCite(omABGD[1]));
        continue;
      }
      const omDash = line.match(patternB_Opt_Dash);
      if (omDash && questionText) {
        options.push(cleanCite(omDash[1]));
        continue;
      }
    }

    // ── Pattern C ──
    if (patternGroup === 'C') {
      // Option line first (to avoid question regex capturing option text)
      const om = line.match(patternC_Opt);
      if (om && questionText) {
        options.push(cleanCite(om[1]));
        continue;
      }
      // Question line — flush previous question if any
      const qm = line.match(patternC_Q);
      if (qm) {
        flush();
        questionText = cleanCite(qm[1]).replace(/\s*[؟?]\s*$/, '؟');
        continue;
      }
    }

    // ── Pattern D ──
    if (patternGroup === 'D') {
      const qm = line.match(patternD_Q);
      if (qm) {
        flush();
        questionText = cleanCite(qm[1]).replace(/\s*[؟?]\s*$/, '؟');
        continue;
      }
      const om = line.match(patternD_Opt);
      if (om && questionText) {
        options.push(cleanCite(om[1]));
        continue;
      }
    }

    // ── Pattern E ──
    if (patternGroup === 'E') {
      if (patternE_Marker.test(line)) {
        flush();
        expectQuestionNextLine = true;
        continue;
      }
      if (expectQuestionNextLine) {
        questionText = cleanCite(line).replace(/\s*[؟?]\s*$/, '؟');
        expectQuestionNextLine = false;
        continue;
      }
      const om = line.match(patternE_Opt);
      if (om && questionText) {
        options.push(cleanCite(om[1]));
        continue;
      }
    }

    // ── Pattern F ──
    if (patternGroup === 'F') {
      if (patternF_Sep.test(line)) {
        flush();
        continue;
      }
      const qm = line.match(patternF_Q);
      if (qm) {
        questionText = cleanCite(stripBold(qm[1])).replace(/\s*[؟?]\s*$/, '؟');
        continue;
      }
      const om = line.match(patternF_Opt);
      if (om && questionText) {
        options.push(cleanCite(om[1]));
        continue;
      }
    }
  }

  // Flush last question
  flush();

  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const txtPath = path.join(__dirname, '..', 'مسابقة الحروف.txt');

  if (!fs.existsSync(txtPath)) {
    throw new Error(`Questions file not found: ${txtPath}`);
  }

  const parsed = parseQuestionsFile(txtPath);

  const uniqueLetters = new Set(parsed.map(q => q.letter)).size;
  console.log(`📖 Loaded ${parsed.length} questions from ${uniqueLetters} letters`);

  // Clear all existing questions (safe — seed only runs in dev/setup)
  await prisma.answer.deleteMany({});
  await prisma.sessionQuestion.deleteMany({});
  await prisma.questionBank.deleteMany({});
  console.log('🗑️  Cleared existing questions');

  // Bulk insert
  await prisma.questionBank.createMany({
    data: parsed.map(q => ({
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      category: q.letter,
      isActive: true,
    })),
  });

  const total = await prisma.questionBank.count();
  console.log(`✅ Inserted ${total} questions`);

  // Print per-letter distribution
  const byLetter = await prisma.questionBank.groupBy({
    by: ['category'],
    _count: { id: true },
    orderBy: { category: 'asc' },
  });
  for (const row of byLetter) {
    console.log(`  حرف (${row.category}): ${row._count.id} سؤال`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
