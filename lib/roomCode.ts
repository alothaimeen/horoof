import { prisma } from './prisma';

export async function generateRoomCode(): Promise<string> {
  let code: string;
  let attempts = 0;

  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    const existing = await prisma.gameSession.findFirst({
      where: { code, status: { not: 'ENDED' } },
    });
    if (!existing) break;
    attempts++;
  } while (attempts < 100);

  return code!;
}
