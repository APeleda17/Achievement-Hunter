import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db/prisma.js';
import { createSteamClient } from './steam/steamClient.js';
import { createSessionMiddleware } from './auth/session.js';

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
});

app.listen(config.PORT, () => {
  console.log(`Serveris veikia: http://localhost:${config.PORT}`);
});
