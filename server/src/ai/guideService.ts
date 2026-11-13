import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import type { AiRepo } from '../db/aiRepo.js';
import type { GuideRepo } from '../db/guideRepo.js';
import type { JobQueue } from '../jobs/jobQueue.js';
import { SOURCE_TTL_MS, sourceQueryHash, type GuideEvidence, type SourcesCollector, type SourceQuery } from '../sources/types.js';
import { allowedSourceUrl } from '../sources/registry.js';
import { GUIDE_PROMPT_VERSION } from './prompts.js';
import { validateGuide } from './guideValidation.js';
import type { AiResultDto, GuideAiClient, GuideDto, GuideSourcesDto, GuideStep } from './types.js';

const hash = (query: SourceQuery) => createHash('sha256').update(`${GUIDE_PROMPT_VERSION}:${sourceQueryHash(query)}`).digest('hex');
const dto = (id: number, steps: GuideStep[], model: string, createdAt: Date, sources: GuideEvidence[]): GuideDto => ({
  id, steps, model, generatedAt: createdAt.toISOString(), generatedByAi: true,
  sources: sources.map(({ id: sourceId, title, url, type, fetchedAt }) => ({ id: sourceId, title, url, type, fetchedAt: fetchedAt.toISOString() })),
});

export function createGuideService(achievements: AiRepo, repo: GuideRepo, collector: SourcesCollector, ai: GuideAiClient, jobs: JobQueue<AiResultDto>) {
  return {
    async sources(userId: number, guideId: number): Promise<GuideSourcesDto> {
      const guide = await repo.findSourcesForUser(userId, guideId);
      if (!guide) throw new AppError(404, 'NOT_FOUND');
      if (guide.sources.some(({ source }) => !allowedSourceUrl(source.url))) throw new AppError(502, 'AI_INVALID_RESPONSE');
      return { guideId: guide.id, generatedAt: guide.createdAt.toISOString(), generatedByAi: true,
        sources: guide.sources.map(({ source, fetchedAt }) => ({ ...source, fetchedAt: fetchedAt.toISOString() })),
      };
    },
    async guide(userId: number, appId: number, apiName: string) {
      const achievement = await achievements.findOwnedAchievement(userId, appId, apiName);
      const query: SourceQuery = { achievementId: achievement.id, appId, name: achievement.name, gameName: achievement.game.name,
        description: achievement.description?.trim() ?? '', achievementNames: await achievements.achievementNames(appId) };
      const inputHash = hash(query);
      const cached = await repo.find(achievement.id);
      const cutoff = Date.now() - SOURCE_TTL_MS;
      if (cached?.inputHash === inputHash && cached.hasReliableInfo && cached.createdAt.getTime() > cutoff && cached.sources.length) {
        const sources: GuideEvidence[] = cached.sources.map((row) => ({ id: row.sourceId, url: row.source.url, title: row.source.title, type: row.source.type as GuideEvidence['type'], excerpt: row.excerpt, fetchedAt: row.fetchedAt }));
        if (sources.every((source) => source.fetchedAt.getTime() > cutoff && allowedSourceUrl(source.url))) {
          try { return { kind: 'result' as const, result: dto(cached.id, validateGuide(cached.steps, sources, query), cached.model, cached.createdAt, sources) }; }
          catch { /* sugadintas rezultatas nelaikomas tinkama talpykla */ }
        }
      }
      const job = jobs.submit(userId, `VADOVAS:${achievement.id}:${inputHash}`, async (signal) => {
        const sources = await collector.collect(query, signal);
        signal.throwIfAborted();
        if (!sources.length) throw new AppError(422, 'NO_RELIABLE_INFO');
        if (sources.some((source) => !allowedSourceUrl(source.url) || [...source.excerpt].length > 4000)) throw new AppError(502, 'AI_INVALID_RESPONSE');
        const generated = await ai.guide({ gameName: query.gameName, name: query.name, description: query.description, sources }, signal);
        signal.throwIfAborted();
        const steps = validateGuide(generated.steps, sources, query);
        const current = await achievements.findOwnedAchievement(userId, appId, apiName);
        if (hash({ ...query, name: current.name, gameName: current.game.name, description: current.description?.trim() ?? '' }) !== inputHash) throw new AppError(409, 'SOURCE_CHANGED');
        const used = new Set(steps.flatMap((step) => step.sourceIds));
        const cited = sources.filter((source) => used.has(source.id));
        signal.throwIfAborted();
        const stored = await repo.save(achievement.id, inputHash, steps, generated.model, cited, signal);
        return dto(stored.id, steps, stored.model, stored.createdAt, cited);
      });
      return { kind: 'job' as const, job };
    },
  };
}
export type GuideService = ReturnType<typeof createGuideService>;
