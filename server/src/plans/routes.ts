import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../auth/requireAuth.js';
import { AppError } from '../errors.js';
import { ACHIEVEMENT_TYPE_VALUES, DIFFICULTY_VALUES } from '../ai/types.js';
import type { PlanService } from './planService.js';

// GVS-16, API-09: plano kriterijai – turimas laikas 15–600 min., neprivalomi sunkumas ir tipas
const createBody = z.object({
  appId: z.number().int().nonnegative().max(2_147_483_647),
  availableMinutes: z.number().int().min(15).max(600),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  type: z.enum(ACHIEVEMENT_TYPE_VALUES).optional(),
}).strict();

export function createPlansRouter(plans: PlanService) {
  const router = Router();

  // NI-12: plano sudarymas – 202 su jobId; rezultatas per GET /api/jobs/:id
  router.post('/plans', async (req, res, next) => {
    try {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      const answer = await plans.create(currentUserId(req), parsed.data.appId, {
        availableMinutes: parsed.data.availableMinutes,
        desiredDifficulty: parsed.data.difficulty ?? null,
        achievementType: parsed.data.type ?? null,
      });
      res.status(202).json({ jobId: answer.job.id, status: answer.job.status });
    } catch (error) { next(error); }
  });

  return router;
}