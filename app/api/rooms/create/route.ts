import { prisma } from '@/lib/prisma';
import { generateRoomCode } from '@/lib/roomCode';
import { NextRequest } from 'next/server';

const QUESTIONS_PER_SESSION = parseInt(
  process.env.QUESTIONS_PER_SESSION || '20'
);

export async function POST(req: NextRequest) {
  try {
    // playerName اختياري الآن — الكابتن يُعرَّف في غرفة الانتظار
    let playerName = 'كابتن';
    try {
      const body = await req.json();
      if (body?.playerName?.trim()) playerName = body.playerName.trim();
    } catch { /* body فارغ */ }

    // تحقق من وجود أسئلة كافية
    const questionCount = await prisma.questionBank.count({
      where: { isActive: true },
    });
    if (questionCount < QUESTIONS_PER_SESSION) {
      return Response.json(
        { error: 'لا توجد أسئلة كافية في البنك' },
        { status: 500 }
      );
    }

    // سحب أسئلة عشوائية
    const questions = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "QuestionBank"
      WHERE "isActive" = true
      ORDER BY RANDOM()
      LIMIT ${QUESTIONS_PER_SESSION}
    `;

    const code = await generateRoomCode();

    const session = await prisma.gameSession.create({
      data: {
        code,
        questions: {
          create: questions.map((q, i) => ({
            questionId: q.id,
            orderIndex: i,
          })),
        },
      },
    });

    return Response.json({ code, sessionId: session.id });
  } catch (err) {
    console.error('create room error:', err);
    return Response.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
