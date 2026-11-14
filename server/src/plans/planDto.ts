import type { PlanRepo } from '../db/planRepo.js';
import type { PlanDto } from '../ai/types.js';

// Plano atsakymo formatas (NI-12, NI-13). Naudojamas ir sudarant, ir peržiūrint planą.
type StoredPlan = NonNullable<Awaited<ReturnType<PlanRepo['getPlan']>>>;

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
    totalMinutes: plan.items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
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