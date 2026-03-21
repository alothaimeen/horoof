import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const session = await prisma.gameSession.findUnique({
      where: { code },
      select: { id: true, status: true, code: true },
    });

    if (!session) {
      return Response.json({ error: 'الغرفة غير موجودة' }, { status: 404 });
    }

    if (session.status === 'ENDED') {
      return Response.json({ error: 'انتهت هذه اللعبة' }, { status: 410 });
    }

    return Response.json({ code: session.code, status: session.status });
  } catch (err) {
    console.error('check room error:', err);
    return Response.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
