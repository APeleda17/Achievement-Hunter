import request from 'supertest';
import { afterEach, vi } from 'vitest';
import { createApp, type AppDeps } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { createSessionMiddleware } from '../src/auth/session.js';
import {
  SteamUnavailableError,
  type SteamClient,
  type OwnedGame,
  type SchemaAchievement,
  type PlayerAchievement,
} from '../src/steam/steamClient.js';

export { prisma };

// ---- Testiniai Steam duomenys ----

export const STEAM_ID_A = '76561198000000001';
export const STEAM_ID_B = '76561198000000002';

/** Naudotojo A biblioteka */
export const GAMES_A: OwnedGame[] = [
  { appId: 620, name: 'Portal 2', iconUrl: null, playtimeMinutes: 600 },
  { appId: 220, name: 'Half-Life 2', iconUrl: null, playtimeMinutes: 300 },
  { appId: 440, name: 'Team Fortress 2', iconUrl: null, playtimeMinutes: 0 },
  { appId: 999, name: 'Be pasiekimų', iconUrl: null, playtimeMinutes: 10 },
];

/** Naudotojo B biblioteka – kitas žaidimas */
export const GAMES_B: OwnedGame[] = [{ appId: 730, name: 'Counter-Strike 2', iconUrl: null, playtimeMinutes: 100 }];

function schemaOf(count: number): SchemaAchievement[] {
  return Array.from({ length: count }, (_, i) => ({
    apiName: `ACH_${i + 1}`,
    name: `Pasiekimas ${i + 1}`,
    description: `Aprašymas ${i + 1}`,
    iconUrl: null,
  }));
}

function playerOf(count: number, unlocked: number): PlayerAchievement[] {
  return Array.from({ length: count }, (_, i) => ({
    apiName: `ACH_${i + 1}`,
    achieved: i < unlocked,
    unlockedAt: i < unlocked ? new Date('2026-01-01T12:00:00Z') : null,
  }));
}

/** appId → [visi pasiekimai, atrakinti]. 999 – „Requested app has no stats“. */
const ACHIEVEMENTS: Record<number, [number, number]> = {
  620: [8, 3], // 3 iš 8 = 37,5 %
  220: [8, 8], // 8 iš 8 = 100,0 %
  440: [5, 0],
  730: [4, 1],
};

/**
 * Steam kliento mock'as. Testas gali perrašyti bet kurį metodą, pvz.
 * `steam.getOwnedGames.mockRejectedValue(steamDown())`.
 */
export function createSteamMock() {
  return {
    getPlayerSummary: vi.fn<SteamClient['getPlayerSummary']>(async () => null),
    getOwnedGames: vi.fn<SteamClient['getOwnedGames']>(async (steamId) =>
      steamId === STEAM_ID_B ? GAMES_B : GAMES_A,
    ),
    getSchemaForGame: vi.fn<SteamClient['getSchemaForGame']>(async (appId) =>
      ACHIEVEMENTS[appId] ? schemaOf(ACHIEVEMENTS[appId][0]) : [],
    ),
    getPlayerAchievements: vi.fn<SteamClient['getPlayerAchievements']>(async (_steamId, appId) =>
      ACHIEVEMENTS[appId] ? playerOf(...ACHIEVEMENTS[appId]) : null,
    ),
        // SDG-05: ACH_1 – 90 %, ACH_2 – 80 % ir t. t. (kuo didesnis numeris, tuo retesnis)
    getGlobalAchievementPercentages: vi.fn<SteamClient['getGlobalAchievementPercentages']>(async (appId) =>
      new Map(
        ACHIEVEMENTS[appId]
          ? Array.from({ length: ACHIEVEMENTS[appId][0] }, (_, i) => [`ACH_${i + 1}`, Math.max(100 - (i + 1) * 10, 0.5)] as const)
          : [],
      ),
    ),
  };
}

export type SteamMock = ReturnType<typeof createSteamMock>;

export const steamDown = () => new SteamUnavailableError('testas: Steam nepasiekiamas');

// ---- Programa ir prisijungimas ----

// Viena sesijų tarpinė programinė įranga visam testų failui (tikra – sesijos saugomos testinėje DB)
const sessionMiddleware = createSessionMiddleware({
  databaseUrl: process.env.DATABASE_URL!,
  secret: process.env.SESSION_SECRET!,
  production: false,
});

/**
 * Programa su Steam mock'u.
 * Testinis prisijungimo maršrutas pridedamas TIK čia – programos kode jo nėra.
 */
const testApps: ReturnType<typeof createApp>[] = [];
afterEach(() => { for (const app of testApps.splice(0)) app.locals.disposeAi(); });

export function createTestApp(steam: SteamMock, aiDeps: Pick<Partial<AppDeps>, 'ai' | 'jobs' | 'sources'> = {}) {
  const app = createApp({ prisma, steam, sessionMiddleware, appUrl: 'http://localhost:5173', ...aiDeps });
  testApps.push(app);
  app.post('/__test/login', (req, res, next) => {
    req.session.userId = req.body.userId;
    req.session.steamId = req.body.steamId;
    req.session.save((err) => (err ? next(err) : res.status(204).end()));
  });
  return app;
}

/** Sukuria naudotoją DB ir grąžina prisijungusį supertest „agentą“ (jis saugo slapuką). */
export async function loginAs(app: ReturnType<typeof createTestApp>, steamId: string) {
  const user = await prisma.user.create({ data: { steamId, personaName: `Žaidėjas ${steamId.slice(-1)}` } });
  const agent = request.agent(app);
  await agent.post('/__test/login').send({ userId: user.id, steamId }).expect(204);
  return { agent, user };
}

/** Išvalo visas lenteles prieš kiekvieną testą. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE naudotojas, zaidimas, pasiekimas, naudotojo_zaidimas, naudotojo_pasiekimas, sesija, isorinis_saltinis RESTART IDENTITY CASCADE',
  );
}

/** Visa naudotojo išsaugota būsena – FR-12 palyginimui „prieš / po“. */
export async function snapshotUser(userId: number) {
  const [user, games, achievements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userGame.findMany({ where: { userId }, orderBy: { appId: 'asc' } }),
    prisma.userAchievement.findMany({ where: { userId }, orderBy: { achievementId: 'asc' } }),
  ]);
  return { user, games, achievements };
}
