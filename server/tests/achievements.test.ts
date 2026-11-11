import { beforeEach, describe, expect, it } from 'vitest';
import { createSteamMock, createTestApp, loginAs, resetDb, STEAM_ID_A } from './helpers.js';

// NI-7: žaidimo pasiekimai ir progresas
describe('NI-7 žaidimo pasiekimai', () => {
  beforeEach(resetDb);

  async function openGame(appId: number) {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);
    const res = await agent.get(`/api/games/${appId}/achievements`);
    return { res, steam, agent };
  }

  it('FR-07: pasiekimų sąrašas su pavadinimu, aprašymu ir būsena', async () => {
    const { res } = await openGame(620);
    expect(res.status).toBe(200);
    expect(res.body.achievements).toHaveLength(8);
    expect(res.body.achievements[0]).toMatchObject({
      apiName: 'ACH_1',
      name: 'Pasiekimas 1',
      description: 'Aprašymas 1',
      unlocked: true,
      unlockedAt: '2026-01-01T12:00:00.000Z',
    });
    expect(res.body.achievements[7]).toMatchObject({ unlocked: false, unlockedAt: null });
  });

  it('FR-08: atrakintų skaičius ir procentas (3 iš 8 → 37,5)', async () => {
    const { res } = await openGame(620);
    expect(res.body.progress).toEqual({ unlocked: 3, total: 8, percent: 37.5 });
  });

  it('FR-08: 8 iš 8 → 100,0', async () => {
    const { res } = await openGame(220);
    expect(res.body.progress).toEqual({ unlocked: 8, total: 8, percent: 100 });
  });

  it('FR-09: žaidimas be pasiekimų („no stats“) – požymis, o ne 0 %', async () => {
    const { res } = await openGame(999);
    expect(res.status).toBe(200);
    expect(res.body.hasAchievements).toBe(false);
    expect(res.body.progress).toBeNull();
    expect(res.body.achievements).toEqual([]);
  });

  it('antrą kartą atidarius – duomenys iš DB, Steam nekviečiamas', async () => {
    const { steam, agent } = await openGame(620);
    await agent.get('/api/games/620/achievements').expect(200);
    expect(steam.getSchemaForGame).toHaveBeenCalledTimes(1);
  });

  it('appId validacija: ne skaičius, neigiamas ar trupmena → 400', async () => {
    const { agent } = await openGame(620);
    for (const bad of ['abc', '-1', '1.5']) {
      const res = await agent.get(`/api/games/${bad}/achievements`);
      expect(res.status, bad).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
