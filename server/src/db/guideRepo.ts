import type { PrismaClient } from '@prisma/client';
import type { GuideEvidence } from '../sources/types.js';
import type { GuideStep } from '../ai/types.js';

export function createGuideRepo(prisma: PrismaClient) {
  return {
    find(achievementId: number) {
      return prisma.guide.findUnique({ where: { achievementId }, include: { sources: { include: { source: true }, orderBy: { position: 'asc' } } } });
    },
    async save(achievementId: number, inputHash: string, steps: GuideStep[], model: string, sources: GuideEvidence[], signal: AbortSignal) {
      return prisma.$transaction(async (tx) => {
        signal.throwIfAborted();
        const guide = await tx.guide.upsert({ where: { achievementId },
          create: { achievementId, inputHash, steps: steps.map((step) => ({ ...step })), model, hasReliableInfo: true },
          update: { inputHash, steps: steps.map((step) => ({ ...step })), model, hasReliableInfo: true, createdAt: new Date() },
        });
        await tx.guideSource.deleteMany({ where: { guideId: guide.id } });
        await tx.guideSource.createMany({ data: sources.map((source, position) => ({ guideId: guide.id, sourceId: source.id, position, excerpt: source.excerpt, fetchedAt: source.fetchedAt })) });
        signal.throwIfAborted();
        return guide;
      });
    },
  };
}
export type GuideRepo = ReturnType<typeof createGuideRepo>;
