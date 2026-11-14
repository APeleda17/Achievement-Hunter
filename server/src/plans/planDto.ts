import type { PlanRepo } from '../db/planRepo.js';
import type { PlanDto, PlanProgressDto, PlanSummaryDto } from '../ai/types.js';
import { calcProgress } from '../achievements/progress.js';

// Plano atsakymo formatas (NI-12, NI-13). Naudojamas ir sudarant, ir peržiūrint planą.
type StoredPlan = NonNullable<Awaited<ReturnType<PlanRepo['getPlan']>>>;
type ListedPlan = Awaited<ReturnType<PlanRepo['listPlans']>>[number];

/** Atliktų punktų dalis, suapvalinta iki 0,1 % (kaip pasiekimų progresas, FR-08) */
export function planProgress(items: { status: string }[]): PlanProgressDto {
  const done = items.filter((item) => item.status === 'DONE').length;
  const progress = calcProgress(done, items.length);
  return { done, total: items.length, percent: progress.hasAchievements ? progress.percent : 0 };
}

const totalMinutes = (items: { estimatedMinutes: number }[]) => items.reduce((sum, item) => sum + item.estimatedMinutes, 0);

export function toPlanDto(plan: StoredPlan): PlanDto {
  return {
    id: plan.id,
    appId: plan.appId,
    gameName: plan.game.name,
    createdAt: plan.createdAt.toISOString(),
    model: plan.model,
    generatedByAi: true,
    criteria: {
      availableMinutes: plan.criteria?.availableMinutes ?? 0,
      desiredDifficulty: plan.criteria?.desiredDifficulty ?? null,
      achievementType: (plan.criteria?.achievementType ?? null) as PlanDto['criteria']['achievementType'],
    },
    totalMinutes: totalMinutes(plan.items),
    progress: planProgress(plan.items),
    items: plan.items.map((item) => ({
      id: item.id,
      position: item.position,
      apiName: item.achievement.apiName,
      name: item.achievement.name,
      description: item.achievement.description,
      iconUrl: item.achievement.iconUrl,
      estimatedMinutes: item.estimatedMinutes,
      justification: item.justification,
      status: item.status === 'DONE' ? 'ATLIKTAS' : 'NEATLIKTAS',
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
  };
}

export function toPlanSummaryDto(plan: ListedPlan): PlanSummaryDto {
  return {
    id: plan.id,
    appId: plan.appId,
    gameName: plan.game.name,
    createdAt: plan.createdAt.toISOString(),
    totalMinutes: totalMinutes(plan.items),
    progress: planProgress(plan.items),
  };
}