import express from 'express';
import type { RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { SteamClient } from './steam/steamClient.js';
import { createAuthRouter } from './auth/routes.js';
import { requireAuth } from './auth/requireAuth.js';
import { errorHandler } from './errors.js';
import { createSyncService } from './sync/syncService.js';
import { createLibraryService } from './library/libraryService.js';
import { createLibraryRouter } from './library/routes.js';
import { createAchievementsService } from './achievements/achievementsService.js';
import { createAchievementsRouter } from './achievements/routes.js';
import { createAiRepo } from './db/aiRepo.js';
import { createExplainService } from './ai/explainService.js';
import { createAiRouter } from './ai/routes.js';
import { createJobQueue, type JobQueue } from './jobs/jobQueue.js';
import type { AiClient, AiResultDto } from './ai/types.js';
import { AppError } from './errors.js';
import { createGuideRepo } from './db/guideRepo.js';
import { createSourcesRepo } from './db/sourcesRepo.js';
import { createSourcesService } from './sources/sourcesService.js';
import type { SourcesCollector } from './sources/types.js';
import { createGuideService } from './ai/guideService.js';
import { createHelpRepo } from './db/helpRepo.js';
import { createHelpService } from './ai/helpService.js';
import { createAvailabilityService } from './ai/availabilityService.js';
import { createAchievementAttributesRepo } from './db/achievementAttributesRepo.js';

export interface AppDeps {
  prisma: PrismaClient;
  steam: SteamClient;
  sessionMiddleware: RequestHandler;
  appUrl: string;
  production?: boolean;
  ai?: AiClient;
  jobs?: JobQueue<AiResultDto>;
  sources?: SourcesCollector;
}

// Express programa kuriama funkcija, kad testuose būtų galima
// perduoti kitas priklausomybes (pvz., Steam kliento mock'ą).
export function createApp(deps: AppDeps) {
  const app = express();
  if (deps.production) app.set('trust proxy', 1);

  app.use(express.json());
  app.use(deps.sessionMiddleware);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(createAuthRouter(deps));

  // Visi kiti /api/* – tik prisijungusiems (API-02)
  app.use('/api', requireAuth);

  const sync = createSyncService(deps.prisma, deps.steam);
  const library = createLibraryService(deps.prisma, sync);
  app.use('/api', createLibraryRouter(library, sync));

  const achievements = createAchievementsService(deps.prisma, sync);
  app.use('/api', createAchievementsRouter(achievements));

  const jobs = deps.jobs ?? createJobQueue<AiResultDto>();
  const ai = deps.ai ?? { explain: async () => { throw new AppError(503, 'AI_UNAVAILABLE'); } };
  const explain = createExplainService(createAiRepo(deps.prisma), ai, jobs);
  const sources = deps.sources ?? createSourcesService(createSourcesRepo(deps.prisma));
  const guides = createGuideService(createAiRepo(deps.prisma), createGuideRepo(deps.prisma),
    sources,
    { guide: deps.ai?.guide ?? (async () => { throw new AppError(503, 'AI_UNAVAILABLE'); }) }, jobs);
  const help = createHelpService(createAiRepo(deps.prisma), createHelpRepo(deps.prisma), sources,
    { help: ai.help ?? (async () => { throw new AppError(503, 'AI_UNAVAILABLE'); }) }, jobs);
    const availability = createAvailabilityService(createAiRepo(deps.prisma), createAchievementAttributesRepo(deps.prisma), sources,
    { assess: ai.assess ?? (async () => { throw new AppError(503, 'AI_UNAVAILABLE'); }) }, jobs);
  app.use('/api', createAiRouter(explain, jobs, guides, help, availability));
  app.locals.disposeAi = () => jobs.dispose();

  app.use(errorHandler);
  return app;
}
