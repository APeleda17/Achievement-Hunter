import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../errors.js';
import type { PlanRepo } from '../db/planRepo.js';
import type { JobQueue } from '../jobs/jobQueue.js';
import { PLAN_PROMPT_VERSION, validatePlan } from '../ai/ollamaPlan.js';
import type { AiResultDto, PlanAiClient, PlanCandidate, PlanCriteriaDto } from '../ai/types.js';
import { toPlanDto, toPlanSummaryDto } from './planDto.js';

// PLN-01..03: „Achievement Hunting“ plano sudarymas (NI-12, U14).

/** Kiek daugiausia kandidatų perduodama modeliui (kad tilptų į kontekstą) */
export const MAX_CANDIDATES = 40;

export function createPlanService(prisma: PrismaClient, plans: PlanRepo, ai: PlanAiClient, jobs: JobQueue<AiResultDto>) {
  /**
   * PLN-01: kandidatai – tik šio naudotojo neatrakinti ir ne „Neprieinami“ pasiekimai (PRI-03),
   * atitinkantys sunkumo ir tipo kriterijus. Dažniau gaunami (didesnis retumo %) – pirmi.
   */
  async function candidatesFor(userId: number, appId: number, criteria: PlanCriteriaDto): Promise<PlanCandidate[]> {
    const rows = await prisma.userAchievement.findMany({
      where: {
        userId,
        status: 'NEATRAKINTAS',
        achievement: {
          appId,
          // SQL „<> 'NEPRIEINAMAS'“ neįtrauktų NULL, todėl neįvertinti nurodomi atskirai
          OR: [{ availability: null }, { availability: { not: 'NEPRIEINAMAS' } }],
          ...(criteria.desiredDifficulty ? { difficulty: criteria.desiredDifficulty } : {}),
          ...(criteria.achievementType ? { achievementType: criteria.achievementType } : {}),
        },
      },
      include: { achievement: true },
      orderBy: { achievement: { id: 'asc' } },
    });
    return rows
      .map((row) => row.achievement)
      .sort((a, b) => (b.rarityPercent ?? -1) - (a.rarityPercent ?? -1))
      .slice(0, MAX_CANDIDATES)
      .map((achievement, index) => ({
        candidateId: index + 1,
        achievementId: achievement.id,
        apiName: achievement.apiName,
        name: achievement.name,
        description: achievement.description?.trim() ?? '',
        difficulty: achievement.difficulty,
        achievementType: achievement.achievementType,
        rarityPercent: achievement.rarityPercent,
      }));
  }

  return {
    async create(userId: number, appId: number, criteria: PlanCriteriaDto) {
      // FR-14: tik savo žaidimui
      const owned = await prisma.userGame.findUnique({ where: { userId_appId: { userId, appId } }, include: { game: true } });
      if (!owned) throw new AppError(404, 'NOT_FOUND');
      const gameName = owned.game.name;

      const candidates = await candidatesFor(userId, appId, criteria);
      // PLN-02: tinkamų pasiekimų nėra – DI nekviečiamas
      if (!candidates.length) throw new AppError(422, 'NO_CANDIDATES');

      const key = createHash('sha256')
        .update(JSON.stringify([PLAN_PROMPT_VERSION, appId, criteria, candidates.map((candidate) => candidate.achievementId)]))
        .digest('hex');

      const job = jobs.submit(userId, `PLANAS:${appId}:${key}`, async (signal) => {
        const generated = await ai.plan({ gameName, criteria, candidates }, signal);
        signal.throwIfAborted();
        // PLN-03: patikrinama dar kartą – nepasitikime vien DI kliento patikra
        const items = validatePlan({ items: generated.items }, candidates, criteria.availableMinutes);
        const byCandidate = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
        signal.throwIfAborted();

        const created = await plans.createPlan(userId, appId, generated.model, criteria,
          items.map((item, index) => ({
            achievementId: byCandidate.get(item.candidateId)!.achievementId,
            position: index + 1,
            estimatedMinutes: item.estimatedMinutes,
            justification: item.justification,
          })));
        const stored = await plans.getPlan(userId, created.id);
        if (!stored) throw new AppError(404, 'NOT_FOUND');
        return toPlanDto(stored);
      });
            return { kind: 'job' as const, job };
    },

    async list(userId: number, appId?: number) {
      return (await plans.listPlans(userId, appId)).map(toPlanSummaryDto);
    },

    async get(userId: number, planId: number) {
      await plans.markUnlockedItemsDone(userId, planId);
      const plan = await plans.getPlan(userId, planId);
      if (!plan) throw new AppError(404, 'NOT_FOUND');
      return toPlanDto(plan);
    },

    async setItemStatus(userId: number, planId: number, itemId: number, status: 'ATLIKTAS' | 'NEATLIKTAS') {
      const updated = await plans.setItemStatus(userId, planId, itemId, status === 'ATLIKTAS' ? 'DONE' : 'NOT_DONE');
      if (!updated) throw new AppError(404, 'NOT_FOUND');
      const plan = await plans.getPlan(userId, planId);
      if (!plan) throw new AppError(404, 'NOT_FOUND');
      return toPlanDto(plan);
    },
  };
}
export type PlanService = ReturnType<typeof createPlanService>;