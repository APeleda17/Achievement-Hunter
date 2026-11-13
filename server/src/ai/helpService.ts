import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors.js';
import type { AiRepo } from '../db/aiRepo.js';
import type { HelpRepo } from '../db/helpRepo.js';
import type { JobQueue } from '../jobs/jobQueue.js';
import { SOURCE_TTL_MS, sourceQueryHash, type SourcesCollector, type SourceQuery } from '../sources/types.js';
import { allowedSourceUrl } from '../sources/registry.js';
import { HELP_PROMPT_VERSION } from './ollamaHelp.js';
import { problemSchema, validateHelp } from './helpValidation.js';
import type { AiResultDto, HelpAiClient, HelpDto } from './types.js';

const snapshots = z.array(z.object({ id: z.number().int().positive(), title: z.string(), url: z.string().refine(allowedSourceUrl),
  type: z.enum(['WIKI', 'STEAM_GUIDE']), excerpt: z.string().refine((text) => [...text].length <= 4000), fetchedAt: z.string().datetime().transform((date) => new Date(date)) })).min(1).max(3);
const fingerprint = (query: SourceQuery, problem: string) => createHash('sha256').update(`${HELP_PROMPT_VERSION}:${sourceQueryHash(query)}:${problem}`).digest('hex');
function result(row: Awaited<ReturnType<HelpRepo['find']>>): HelpDto {
  if (!row) throw new AppError(404, 'NOT_FOUND');
  const sources = snapshots.parse(row.sourceSnapshot);
  return { id: row.id, problem: row.problem, ...validateHelp({ causes: row.causes, steps: row.steps }, sources), model: row.model,
    generatedByAi: true, generatedAt: row.createdAt.toISOString(), sources: sources.map(({ excerpt: _text, fetchedAt, ...source }) => ({ ...source, fetchedAt: fetchedAt.toISOString() })) };
}

export function createHelpService(achievements: AiRepo, repo: HelpRepo, collector: SourcesCollector, ai: HelpAiClient, jobs: JobQueue<AiResultDto>) {
  return {
    async history(userId: number, appId: number, apiName: string) {
      const achievement = await achievements.findOwnedAchievement(userId, appId, apiName);
      const rows = await repo.history(userId, achievement.id);
      return rows.flatMap((row) => { try { return [result(row)]; } catch { return []; } });
    },
    async help(userId: number, appId: number, apiName: string, input: string) {
      const parsed = problemSchema.safeParse(input);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      const problem = parsed.data;
      const achievement = await achievements.findOwnedAchievement(userId, appId, apiName);
      const query: SourceQuery = { achievementId: achievement.id, appId, name: achievement.name, gameName: achievement.game.name,
        description: achievement.description?.trim() ?? '', achievementNames: await achievements.achievementNames(appId) };
      const hash = fingerprint(query, problem);
      const cached = await repo.find(userId, hash);
      if (cached && cached.createdAt.getTime() > Date.now() - SOURCE_TTL_MS) {
        try {
          const evidence = snapshots.parse(cached.sourceSnapshot);
          if (evidence.every((source) => source.fetchedAt.getTime() > Date.now() - SOURCE_TTL_MS)) return { kind: 'result' as const, result: result(cached) };
        } catch { /* regenerate invalid cached data */ }
      }
      const job = jobs.submit(userId, `PAGALBA:${achievement.id}:${hash}`, async (signal) => {
        const sources = await collector.collect(query, signal);
        signal.throwIfAborted();
        if (!sources.length) throw new AppError(422, 'NO_RELIABLE_INFO');
        if (!snapshots.safeParse(sources.map((source) => ({ ...source, fetchedAt: source.fetchedAt.toISOString() }))).success) throw new AppError(502, 'AI_INVALID_RESPONSE');
        const generated = await ai.help({ gameName: query.gameName, name: query.name, description: query.description, problem, sources }, signal);
        signal.throwIfAborted();
        const validated = validateHelp(generated, sources);
        const current = await achievements.findOwnedAchievement(userId, appId, apiName);
        if (fingerprint({ ...query, name: current.name, description: current.description?.trim() ?? '', gameName: current.game.name }, problem) !== hash) throw new AppError(409, 'SOURCE_CHANGED');
        const used = new Set([...validated.causes, ...validated.steps].flatMap((item) => item.sourceIds));
        const saved = await repo.save(userId, achievement.id, hash, problem, validated.causes, validated.steps, generated.model, sources.filter((source) => used.has(source.id)), signal);
        return result(saved);
      });
      return { kind: 'job' as const, job };
    },
  };
}
export type HelpService = ReturnType<typeof createHelpService>;
