import type { Difficulty, PlanItemStatus, PrismaClient } from '@prisma/client';

// DPK-06: „Achievement Hunting“ planų duomenų prieiga (NI-12, NI-13).
// Naudotojas visada tikrinamas pačioje užklausoje (FR-14 principas), ne po jos.

export interface PlanCriteriaInput {
  availableMinutes: number;
  desiredDifficulty?: Difficulty | null;
  achievementType?: string | null;
}

export interface PlanItemInput {
  achievementId: number;
  position: number;
  estimatedMinutes: number;
  justification: string;
}

export function createPlanRepo(prisma: PrismaClient) {
  return {
    /** Planas su kriterijais ir punktais – viena transakcija; punktai pradžioje NOT_DONE (PLN-04). */
    createPlan(userId: number, appId: number, model: string, criteria: PlanCriteriaInput, items: PlanItemInput[]) {
      return prisma.$transaction((tx) =>
        tx.collectionPlan.create({
          data: {
            userId,
            appId,
            model,
            criteria: {
              create: {
                availableMinutes: criteria.availableMinutes,
                desiredDifficulty: criteria.desiredDifficulty ?? null,
                achievementType: criteria.achievementType ?? null,
              },
            },
            items: { create: items.map((item) => ({ ...item, status: 'NOT_DONE' as const })) },
          },
          include: { criteria: true, items: { orderBy: { position: 'asc' } } },
        }),
      );
    },

    /** Tik šio naudotojo planai, naujausi pirmi, su punktų skaičiumi. */
    listPlans(userId: number) {
      return prisma.collectionPlan.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { game: { select: { name: true } }, _count: { select: { items: true } } },
      });
    },

    /** Planas su kriterijais ir punktais; svetimas ar neegzistuojantis planas → null. */
    getPlan(userId: number, planId: number) {
      return prisma.collectionPlan.findFirst({
        where: { id: planId, userId },
        include: {
          criteria: true,
          items: { orderBy: { position: 'asc' }, include: { achievement: true } },
        },
      });
    },

    /**
     * Punkto būsenos keitimas tik savo plane (PLN-05).
     * DONE nustato completedAt, NOT_DONE jį išvalo. Grąžina false, jei punktas nerastas arba svetimas.
     */
    async setItemStatus(userId: number, planId: number, itemId: number, status: PlanItemStatus) {
      const { count } = await prisma.planItem.updateMany({
        where: { id: itemId, planId, plan: { userId } },
        data: { status, completedAt: status === 'DONE' ? new Date() : null },
      });
      return count === 1;
    },
  };
}
export type PlanRepo = ReturnType<typeof createPlanRepo>;