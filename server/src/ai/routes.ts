import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../auth/requireAuth.js';
import { AppError } from '../errors.js';
import type { JobQueue } from '../jobs/jobQueue.js';
import type { AiResultDto } from './types.js';
import type { ExplainService } from './explainService.js';
import type { GuideService } from './guideService.js';
import type { HelpService } from './helpService.js';
import { problemSchema } from './helpValidation.js';

const explainBody = z.object({
  appId: z.number().int().nonnegative().max(2_147_483_647),
  apiName: z.string().trim().min(1).max(255),
}).strict();

export function createAiRouter(service: ExplainService, jobs: JobQueue<AiResultDto>, guides: GuideService, help: HelpService) {
  const router = Router();
  router.post('/ai/help', async (req, res, next) => {
    try {
      const parsed = explainBody.extend({ problem: problemSchema }).safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      const answer = await help.help(currentUserId(req), parsed.data.appId, parsed.data.apiName, parsed.data.problem);
      if (answer.kind === 'result') res.json(answer.result);
      else res.status(202).json({ jobId: answer.job.id, status: answer.job.status });
    } catch (error) { next(error); }
  });
  router.get('/ai/help', async (req, res, next) => {
    try {
      const parsed = explainBody.extend({ appId: z.string().regex(/^\d+$/).transform(Number).pipe(explainBody.shape.appId) }).safeParse(req.query);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      res.json({ requests: await help.history(currentUserId(req), parsed.data.appId, parsed.data.apiName) });
    } catch (error) { next(error); }
  });
  router.post('/ai/guide', async (req, res, next) => {
    try {
      const parsed = explainBody.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      const answer = await guides.guide(currentUserId(req), parsed.data.appId, parsed.data.apiName);
      if (answer.kind === 'result') res.json(answer.result);
      else res.status(202).json({ jobId: answer.job.id, status: answer.job.status });
    } catch (error) { next(error); }
  });
  router.post('/ai/explain', async (req, res, next) => {
    try {
      const parsed = explainBody.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      const answer = await service.explain(currentUserId(req), parsed.data.appId, parsed.data.apiName);
      if (answer.kind === 'result') res.json(answer.result);
      else res.status(202).json({ jobId: answer.job.id, status: answer.job.status });
    } catch (error) { next(error); }
  });
  router.get('/jobs/:id', (req, res, next) => {
    try {
      const parsed = z.string().uuid().safeParse(req.params.id);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      res.json(jobs.get(currentUserId(req), parsed.data));
    } catch (error) { next(error); }
  });
  return router;
}
