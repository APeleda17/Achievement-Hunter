import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSteamMock,
  createTestApp,
  loginAs,
  prisma,
  resetDb,
  snapshotUser,
  STEAM_ID_A,
  steamDown,
} from './helpers.js';

type Game = { appId: number; hasAchievements: boolean | null; progressPercent: number | null; unlockedCount: number | null };
const byId = (games: Game[], appId: number) => games.find((g) => g.appId === appId)!;

// NI-8: duomenų atnaujinimas
describe('NI-8 duomenų atnaujinimas', () => {
  beforeEach(resetDb);

  it('FR-10: „Atnaujinti“ parsiunčia pasiekimus žaistiems žaidimams ir grąžina atnaujintą sąrašą', async () => {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);

    const res = await agent.post('/api/sync').expect(200);
    const games: Game[] = res.body.games;

    expect(byId(games, 620)).toMatchObject({ hasAchievements: true, unlockedCount: 3, progressPercent: 37.5 });
    expect(byId(games, 220)).toMatchObject({ hasAchievements: true, progressPercent: 100 });
    // FR-09: žaidimas be pasiekimų – ne 0 %
    expect(byId(games, 999)).toMatchObject({ hasAchievements: false, progressPercent: null });
    // TF2 nežaistas (0 min.) – pasiekimai nesiunčiami, progresas nežinomas
    expect(byId(games, 440)).toMatchObject({ hasAchievements: null, progressPercent: null });
    expect(steam.getSchemaForGame).not.toHaveBeenCalledWith(440);
  });

  it('FR-11: atnaujinimo laikas pasikeičia po sėkmingo atnaujinimo', async () => {
    const { agent } = await loginAs(createTestApp(createSteamMock()), STEAM_ID_A);
    const first = await agent.get('/api/games').expect(200);
    await new Promise((r) => setTimeout(r, 20));

    const second = await agent.post('/api/sync').expect(200);
    expect(new Date(second.body.lastSyncedAt).getTime()).toBeGreaterThan(new Date(first.body.lastSyncedAt).getTime());
  });

  it('FR-12: Steam nepasiekiamas – seni duomenys neperrašomi, grąžinamas požymis apie išsaugotus duomenis', async () => {
    const steam = createSteamMock();
    const { agent, user } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);
    await agent.post('/api/sync').expect(200);
    const before = await snapshotUser(user.id);

    // Steam grąžina pakitusius duomenis, bet vieno žaidimo užklausa nepavyksta.
    // „Viskas arba nieko“: neturi būti įrašyta nei viena dalis.
    steam.getOwnedGames.mockResolvedValue([{ appId: 620, name: 'Portal 2 (pakeista)', iconUrl: null, playtimeMinutes: 9999 }]);
    steam.getPlayerAchievements.mockRejectedValue(steamDown());

    const res = await agent.post('/api/sync').expect(503);
    expect(res.body.error).toEqual({ code: 'STEAM_UNAVAILABLE', hasCachedData: true });

    expect(await snapshotUser(user.id)).toEqual(before); // FR-11: laikas irgi nepasikeitė
    const list = await agent.get('/api/games').expect(200);
    expect(list.body.games).toHaveLength(4); // rodomi išsaugoti duomenys
  });

  it('FR-12: žaidimo atnaujinimas nepavyksta – žaidimo pasiekimai lieka', async () => {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);
    const before = await agent.get('/api/games/620/achievements').expect(200);

    steam.getSchemaForGame.mockRejectedValue(steamDown());
    const res = await agent.post('/api/games/620/sync').expect(503);
    expect(res.body.error).toEqual({ code: 'STEAM_UNAVAILABLE', hasCachedData: true });

    const after = await agent.get('/api/games/620/achievements').expect(200);
    expect(after.body).toEqual(before.body);
  });

  it('FR-13: Steam nepasiekiamas ir duomenų nėra – klaida, ne tuščias sąrašas', async () => {
    const steam = createSteamMock();
    steam.getOwnedGames.mockRejectedValueOnce(steamDown()); // tik pirmas kvietimas nepavyksta
    const { agent, user } = await loginAs(createTestApp(steam), STEAM_ID_A);

    const res = await agent.get('/api/games').expect(503);
    expect(res.body.error).toEqual({ code: 'STEAM_UNAVAILABLE', hasCachedData: false });
    expect(res.body.games).toBeUndefined();

    // Laikas nenustatytas, todėl kitą kartą bus bandoma vėl
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.lastLibrarySyncAt).toBeNull();

    // Steam vėl veikia – „Bandyti dar kartą“ pavyksta
    const retry = await agent.get('/api/games').expect(200);
    expect(retry.body.games).toHaveLength(4);
  });

  it('FR-13: žaidimo pasiekimų dar nėra ir Steam nepasiekiamas – klaida su hasCachedData=false', async () => {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);

    steam.getSchemaForGame.mockRejectedValue(steamDown());
    const res = await agent.get('/api/games/620/achievements').expect(503);
    expect(res.body.error).toEqual({ code: 'STEAM_UNAVAILABLE', hasCachedData: false });
  });

  it('API-06: kol vyksta atnaujinimas, antras grąžina 409', async () => {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);

    // Pirmas atnaujinimas „užstringa“, kol jo neatleisime
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = steam.getOwnedGames.getMockImplementation()!;
    steam.getOwnedGames.mockImplementationOnce(async (id) => {
      await gate;
      return original(id);
    });

    const first = agent.post('/api/sync').then((r) => r);
    await new Promise((r) => setTimeout(r, 50));

    const second = await agent.post('/api/sync');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SYNC_IN_PROGRESS');

    release();
    expect((await first).status).toBe(200);
  });
});
