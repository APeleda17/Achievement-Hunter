import type { PrismaClient } from '@prisma/client';
import { AppError } from '../errors.js';

export function createAiRepo(prisma: PrismaClient) {
  return {
    async achievementNames(appId: number) {
      return (await prisma.achievement.findMany({ where: { appId }, select: { name: true } })).map((row) => row.name);
    },
    async findOwnedAchievement(userId: number, appId: number, apiName: string) {
      const owned = await prisma.userGame.findUnique({ where: { userId_appId: { userId, appId } } });
      if (!owned) throw new AppError(404, 'NOT_FOUND');
      const achievement = await prisma.achievement.findUnique({
        where: { appId_apiName: { appId, apiName } },
        include: { game: { select: { name: true } }, explanation: true },
      });
      if (!achievement) throw new AppError(404, 'NOT_FOUND');
      return achievement;
    },
    saveExplanation(achievementId: number, sourceHash: string, text: string, model: string, signal: AbortSignal) {
      return prisma.$transaction(async (tx) => {
        signal.throwIfAborted();
        const saved = await tx.achievementExplanation.upsert({
          where: { achievementId },
          create: { achievementId, sourceHash, text, model },
          update: { sourceHash, text, model, createdAt: new Date() },
        });
        // Pasibaigus užduoties laikui negalima patvirtinti pavėluoto rezultato.
        signal.throwIfAborted();
        return saved;
      });
    },
  };
}
export type AiRepo = ReturnType<typeof createAiRepo>;
