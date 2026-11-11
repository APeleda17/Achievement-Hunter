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

export interface AppDeps {
  prisma: PrismaClient;
  steam: SteamClient;
  sessionMiddleware: RequestHandler;
  appUrl: string;
  production?: boolean;
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

  app.use(errorHandler);
  return app;
}
