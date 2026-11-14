import type { Difficulty, PlanItemStatus, PrismaClient } from '@prisma/client';


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

    listPlans(userId: number, appId?: number) {
      return prisma.collectionPlan.findMany({
        where: { userId, ...(appId !== undefined ? { appId } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          game: { select: { name: true } },
          _count: { select: { items: true } },
          items: { select: { status: true, estimatedMinutes: true } },
        },
      });
    },

    async markUnlockedItemsDone(userId: number, planId: number) {
      const { count } = await prisma.planItem.updateMany({
        where: {
          planId,
          plan: { userId },
          status: 'NOT_DONE',
          achievement: { users: { some: { userId, status: 'ATRAKINTAS' } } },
        },
        data: { status: 'DONE', completedAt: new Date() },
      });
      return count;
    },

    getPlan(userId: number, planId: number) {
      return prisma.collectionPlan.findFirst({
        where: { id: planId, userId },
        include: {
          game: { select: { name: true } },
          criteria: true,
          items: { orderBy: { position: 'asc' }, include: { achievement: true } },
        },
      });
    },


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