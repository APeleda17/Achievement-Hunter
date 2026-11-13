import type { PrismaClient, Prisma } from '@prisma/client';
import type { GuideEvidence } from '../sources/types.js';
import type { GuideStep, HelpCause } from '../ai/types.js';

export function createHelpRepo(prisma: PrismaClient) {
  return {
    find(userId: number, inputHash: string) {
      return prisma.helpRequest.findUnique({ where: { userId_inputHash: { userId, inputHash } } });
    },
    history(userId: number, achievementId: number) {
      return prisma.helpRequest.findMany({ where: { userId, achievementId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 });
    },
    save(userId: number, achievementId: number, inputHash: string, problem: string, causes: HelpCause[], steps: GuideStep[], model: string, sources: GuideEvidence[], signal: AbortSignal) {
      return prisma.$transaction(async (tx) => {
        signal.throwIfAborted();
        const data = { problem, causes: causes as unknown as Prisma.InputJsonValue, steps: steps as unknown as Prisma.InputJsonValue,
          model, sourceSnapshot: sources.map((source) => ({ ...source, fetchedAt: source.fetchedAt.toISOString() })) as Prisma.InputJsonValue };
        const stored = await tx.helpRequest.upsert({ where: { userId_inputHash: { userId, inputHash } },
          create: { userId, achievementId, inputHash, ...data }, update: { ...data, createdAt: new Date() } });
        signal.throwIfAborted();
        return stored;
      });
    },
  };
}
export type HelpRepo = ReturnType<typeof createHelpRepo>;
