import type { Difficulty, PrismaClient } from '@prisma/client';

// DPK-06: bendrų pasiekimo atributų įrašymas (NI-9, NI-11).
// Šių laukų Steam sinchronizacija neliečia (libraryRepo.saveGameAchievements).

export type Availability = 'PRIEINAMAS' | 'NEPRIEINAMAS' | 'NEZINOMA';

export interface AssessmentInput {
  availability: Availability;
  difficulty: Difficulty | null;
  achievementType: string | null;
  reason: string;
  model: string;
}

export function createAchievementAttributesRepo(prisma: PrismaClient) {
  return {
    /** DI prieinamumo ir sunkumo įvertinimas su pagrindimu (PRI-01, DIS-06). */
    saveAssessment(achievementId: number, input: AssessmentInput) {
      return prisma.achievement.update({
        where: { id: achievementId },
        data: {
          availability: input.availability,
          difficulty: input.difficulty,
          achievementType: input.achievementType,
          availabilityReason: input.reason,
          assessmentModel: input.model,
          assessedAt: new Date(),
        },
      });
    },

    /** Steam retumas procentais (SDG-05, PAS-05). Raktai – pasiekimų apiName. */
    saveRarity(appId: number, percents: Map<string, number>) {
      const now = new Date();
      return prisma.$transaction(
        [...percents].map(([apiName, percent]) =>
          prisma.achievement.updateMany({
            where: { appId, apiName },
            data: { rarityPercent: percent, rarityUpdatedAt: now },
          }),
        ),
      );
    },
  };
}
export type AchievementAttributesRepo = ReturnType<typeof createAchievementAttributesRepo>;