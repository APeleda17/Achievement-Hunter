import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db/prisma.js';
import { createSteamClient } from './steam/steamClient.js';
import { createSessionMiddleware } from './auth/session.js';
import { createOllamaClient } from './ai/ollamaClient.js';

const production = config.NODE_ENV === 'production';

if (!config.STEAM_API_KEY) {
  console.warn('[config] STEAM_API_KEY nenustatytas – Steam duomenų gauti nepavyks.');
}

const app = createApp({
  prisma,
  steam: createSteamClient(config.STEAM_API_KEY),
  sessionMiddleware: createSessionMiddleware({
    databaseUrl: config.DATABASE_URL,
    secret: config.SESSION_SECRET,
    production,
  }),
  appUrl: config.APP_URL,
  production,
  ai: createOllamaClient({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL, timeoutMs: config.OLLAMA_TIMEOUT_MS }),
});

const server = app.listen(config.PORT, () => {
  console.log(`Serveris veikia: http://localhost:${config.PORT}`);
});

function shutdown() {
  app.locals.disposeAi();
  server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
