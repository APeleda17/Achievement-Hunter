import express from 'express';
import type { RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { SteamClient } from './steam/steamClient.js';
import { createAuthRouter } from './auth/routes.js';
import { requireAuth } from './auth/requireAuth.js';
import { errorHandler } from './errors.js';

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

  app.use(errorHandler);
  return app;
}
