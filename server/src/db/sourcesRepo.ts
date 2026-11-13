import type { PrismaClient } from '@prisma/client';
import type { GuideEvidence, SourceCandidate } from '../sources/types.js';

export function createSourcesRepo(prisma: PrismaClient) {
  return {
    async cached(achievementId: number, queryHash: string, cutoff: Date): Promise<GuideEvidence[]> {
      const rows = await prisma.sourceExcerpt.findMany({ where: { achievementId, queryHash, fetchedAt: { gte: cutoff } }, include: { source: true }, orderBy: { id: 'asc' }, take: 3 });
      return rows.filter((r) => r.source.type === 'WIKI' || r.source.type === 'STEAM_GUIDE').map((r) => ({ id: r.sourceId, url: r.source.url, title: r.source.title, type: r.source.type as 'WIKI' | 'STEAM_GUIDE', excerpt: r.excerpt, fetchedAt: r.fetchedAt }));
    },
    async save(achievementId: number, queryHash: string, candidates: SourceCandidate[], signal: AbortSignal): Promise<GuideEvidence[]> {
      return prisma.$transaction(async (tx) => {
        signal.throwIfAborted();
        const result: GuideEvidence[] = [];
        for (const item of candidates) {
          const fetchedAt = item.fetchedAt ?? new Date();
          const source = await tx.externalSource.upsert({ where: { url: item.url }, create: { url: item.url, title: item.title, type: item.type, fetchedAt }, update: { title: item.title, type: item.type, fetchedAt } });
          await tx.sourceExcerpt.upsert({ where: { achievementId_sourceId: { achievementId, sourceId: source.id } }, create: { achievementId, sourceId: source.id, queryHash, excerpt: item.excerpt, fetchedAt }, update: { queryHash, excerpt: item.excerpt, fetchedAt } });
          result.push({ ...item, id: source.id, fetchedAt });
        }
        signal.throwIfAborted();
        return result;
      });
    },
  };
}
export type SourcesRepo = ReturnType<typeof createSourcesRepo>;
