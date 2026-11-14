import { AppError } from '../errors.js';
import type { AiRepo } from '../db/aiRepo.js';
import type { AchievementAttributesRepo, Availability } from '../db/achievementAttributesRepo.js';
import type { JobQueue } from '../jobs/jobQueue.js';
import { SOURCE_TTL_MS, type GuideEvidence, type SourceQuery, type SourcesCollector } from '../sources/types.js';
import { validateAssessment } from './ollamaAssess.js';
import type { AiAvailability, AiResultDto, AssessmentAiClient, AvailabilityDto } from './types.js';

// PRI-01..03, DIS-06: pasiekimo prieinamumo ir sunkumo įvertinimas (NI-9, U11).
// Įvertinimas bendras visiems naudotojams ir saugomas Achievement lentelėje.

const TO_DB: Record<AiAvailability, Availability> = { AVAILABLE: 'PRIEINAMAS', UNAVAILABLE: 'NEPRIEINAMAS', UNKNOWN: 'NEZINOMA' };

type StoredAchievement = Awaited<ReturnType<AiRepo['findOwnedAchievement']>>;

function dto(row: StoredAchievement): AvailabilityDto {
  if (!row.availability || !row.assessedAt) throw new AppError(404, 'NOT_FOUND');
  return {
    availability: row.availability as AvailabilityDto['availability'],
    difficulty: row.difficulty,
    achievementType: row.achievementType,
    reason: row.availabilityReason ?? '',
    assessedAt: row.assessedAt.toISOString(),
    model: row.assessmentModel ?? '',
    generatedByAi: true,
  };
}

export function createAvailabilityService(
  achievements: AiRepo,
  attributes: AchievementAttributesRepo,
  collector: SourcesCollector,
  ai: AssessmentAiClient,
  jobs: JobQueue<AiResultDto>,
) {
  return {
    async availability(userId: number, appId: number, apiName: string) {
      // Tik žaidimą turintis naudotojas (FR-14)
      const achievement = await achievements.findOwnedAchievement(userId, appId, apiName);

      // PRI-01: išsaugotas ir ne senesnis nei 30 d. įvertinimas grąžinamas iš karto, DI nekviečiamas
      if (achievement.availability && achievement.assessedAt && achievement.assessedAt.getTime() > Date.now() - SOURCE_TTL_MS) {
        return { kind: 'result' as const, result: dto(achievement) };
      }

      const query: SourceQuery = {
        achievementId: achievement.id, appId, name: achievement.name, gameName: achievement.game.name,
        description: achievement.description?.trim() ?? '', achievementNames: await achievements.achievementNames(appId),
      };

      // PRI-02: įvertinimo nėra – sukuriama PRIEINAMUMAS užduotis
      const job = jobs.submit(userId, `PRIEINAMUMAS:${achievement.id}`, async (signal) => {
        let sources: GuideEvidence[] = [];
        try {
          sources = await collector.collect(query, signal);
        } catch (error) {
          // Šaltiniai nepasiekiami – vertinama tik pagal sąlygą; „Neprieinamas“ be šaltinio tada neįmanomas
          signal.throwIfAborted();
          if (!(error instanceof AppError && error.code === 'SOURCES_UNAVAILABLE')) throw error;
        }
        signal.throwIfAborted();

        const generated = await ai.assess({ gameName: query.gameName, name: query.name, description: query.description, sources }, signal);
        signal.throwIfAborted();
        const assessment = validateAssessment(
          { availability: generated.availability, difficulty: generated.difficulty, achievementType: generated.achievementType,
            reason: generated.reason, sourceIds: generated.sourceIds },
          sources,
        );

        const saved = await attributes.saveAssessment(achievement.id, {
          availability: TO_DB[assessment.availability],
          difficulty: assessment.difficulty,
          achievementType: assessment.achievementType,
          reason: assessment.reason,
          model: generated.model,
        });
        return dto({ ...achievement, ...saved });
      });
      return { kind: 'job' as const, job };
    },
  };
}
export type AvailabilityService = ReturnType<typeof createAvailabilityService>;