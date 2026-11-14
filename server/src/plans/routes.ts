import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../auth/requireAuth.js';
import { AppError } from '../errors.js';
import { ACHIEVEMENT_TYPE_VALUES, DIFFICULTY_VALUES } from '../ai/types.js';
import type { PlanService } from './planService.js';

const createBody = z.object({
  appId: z.number().int().nonnegative().max(2_147_483_647),
  availableMinutes: z.number().int().min(15).max(600),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  type: z.enum(ACHIEVEMENT_TYPE_VALUES).optional(),
}).strict();

const positiveId = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2_147_483_647));
const listQuery = z.object({ appId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().max(2_147_483_647)).optional() });
const itemBody = z.object({ status: z.enum(['ATLIKTAS', 'NEATLIKTAS']) }).strict();

function parseOrFail<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
  return parsed.data;
}

export function createPlansRouter(plans: PlanService) {
  const router = Router();

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

  router.get('/plans', async (req, res, next) => {
    try {
      const { appId } = parseOrFail(listQuery, req.query);
      res.json({ plans: await plans.list(currentUserId(req), appId) });
    } catch (error) { next(error); }
  });

  router.get('/plans/:id', async (req, res, next) => {
    try {
      res.json(await plans.get(currentUserId(req), parseOrFail(positiveId, req.params.id)));
    } catch (error) { next(error); }
  });

  router.patch('/plans/:id/items/:itemId', async (req, res, next) => {
    try {
      const planId = parseOrFail(positiveId, req.params.id);
      const itemId = parseOrFail(positiveId, req.params.itemId);
      const { status } = parseOrFail(itemBody, req.body);
      res.json(await plans.setItemStatus(currentUserId(req), planId, itemId, status));
    } catch (error) { next(error); }
  });

  return router;
}