import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../auth/requireAuth.js';
import { AppError } from '../errors.js';
import type { AchievementsService } from './achievementsService.js';

// appId – neneigiamas sveikasis skaičius (telpantis į PostgreSQL INTEGER)
const appIdParams = z.object({
  appId: z.coerce.number().int().nonnegative().max(2_147_483_647),
});

function parseAppId(params: unknown): number {
  const parsed = appIdParams.safeParse(params);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
  return parsed.data.appId;
}

// Endpointai montuojami po /api, todėl requireAuth jau patikrintas (API-02).
// userId imamas tik iš sesijos – URL'e jo nėra ir negali būti (FR-14).
export function createAchievementsRouter(achievements: AchievementsService) {
  const router = Router();

  // FR-07, FR-08, FR-09
  router.get('/games/:appId/achievements', async (req, res, next) => {
    try {
      res.json(await achievements.getAchievements(currentUserId(req), parseAppId(req.params)));
    } catch (err) {
      next(err);
    }
  });

  // FR-10: vieno žaidimo atnaujinimas
  router.post('/games/:appId/sync', async (req, res, next) => {
    try {
      res.json(await achievements.refreshAchievements(currentUserId(req), parseAppId(req.params)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
