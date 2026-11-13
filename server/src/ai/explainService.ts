import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import type { AiRepo } from '../db/aiRepo.js';
import type { JobQueue } from '../jobs/jobQueue.js';
import { EXPLAIN_PROMPT_VERSION } from './prompts.js';
import { characterCount, validateExplanation } from './ollamaClient.js';
import type { AiClient, AiResultDto, ExplainInput } from './types.js';

const fingerprint = (input: ExplainInput) => createHash('sha256').update(JSON.stringify([EXPLAIN_PROMPT_VERSION, input])).digest('hex');

export function createExplainService(repo: AiRepo, ai: AiClient, jobs: JobQueue<AiResultDto>) {
  return {
    async explain(userId: number, appId: number, apiName: string) {
      const achievement = await repo.findOwnedAchievement(userId, appId, apiName);
      const description = achievement.description?.trim();
      if (!description || characterCount(description) < 2) throw new AppError(422, 'NO_DESCRIPTION');
      const input: ExplainInput = { gameName: achievement.game.name, name: achievement.name, description };
      const sourceHash = fingerprint(input);
      const saved = achievement.explanation;
      if (saved?.sourceHash === sourceHash) {
        return { kind: 'result' as const, result: {
          text: saved.text, model: saved.model, generatedAt: saved.createdAt.toISOString(), generatedByAi: true as const,
        } };
      }
      const job = jobs.submit(userId, `PAAISKINTI:${achievement.id}:${sourceHash}`, async (signal) => {
        signal.throwIfAborted();
        const generated = await ai.explain(input, signal);
        signal.throwIfAborted();
        const text = validateExplanation(generated.text, description);
        const current = await repo.findOwnedAchievement(userId, appId, apiName);
        if (fingerprint({ gameName: current.game.name, name: current.name, description: current.description?.trim() ?? '' }) !== sourceHash) {
          throw new AppError(409, 'SOURCE_CHANGED');
        }
        signal.throwIfAborted();
        const stored = await repo.saveExplanation(achievement.id, sourceHash, text, generated.model, signal);
        return { text: stored.text, model: stored.model, generatedAt: stored.createdAt.toISOString(), generatedByAi: true };
      });
      return { kind: 'job' as const, job };
    },
  };
}
export type ExplainService = ReturnType<typeof createExplainService>;
