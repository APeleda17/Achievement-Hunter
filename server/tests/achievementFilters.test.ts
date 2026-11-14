import { beforeEach, describe, expect, it } from 'vitest';
import type { Difficulty } from '@prisma/client';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A, steamDown } from './helpers.js';

// 3 sprintas, 4 užduotis: pasiekimų filtravimas ir rūšiavimas (NI-10, NI-11; PAS-04, PAS-05, API-10)
// Mock duomenys: žaidimas 620 turi 8 pasiekimus, atrakinti ACH_1–ACH_3; retumas ACH_n = 100 − 10·n %.

describe('NI-10, NI-11: GET /api/games/:appId/achievements su filtrais ir rūšiavimu', () => {
  beforeEach(resetDb);

  async function openGame(steam = createSteamMock()) {
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);
    await agent.get('/api/games').expect(200);
    await agent.get('/api/games/620/achievements').expect(200);
    return { agent, steam };
  }

  async function setAttributes(apiName: string, data: { difficulty?: Difficulty | null; availability?: string; achievementType?: string; rarityPercent?: number | null }) {
    await prisma.achievement.update({ where: { appId_apiName: { appId: 620, apiName } }, data });
  }

  const apiNames = (body: { achievements: { apiName: string }[] }) => body.achievements.map((a) => a.apiName);

  it('PAS-05: sąraše yra retumas ir 3 sprinto laukai; Steam retumui kviečiamas tik kartą per 24 h', async () => {
    const { agent, steam } = await openGame();
    const res = await agent.get('/api/games/620/achievements').expect(200);

    expect(res.body.filtered).toBe(false);
    expect(res.body.achievements[0]).toMatchObject({
      apiName: 'ACH_1', rarityPercent: 90, availability: null, availabilityReason: null, difficulty: null, achievementType: null,
    });
    expect(steam.getGlobalAchievementPercentages).toHaveBeenCalledTimes(1);
  });

  it('Steam retumui nepasiekiamas – sąrašas vis tiek grąžinamas (retumas null)', async () => {
    const steam = createSteamMock();
    steam.getGlobalAchievementPercentages.mockRejectedValue(steamDown());
    const { agent } = await openGame(steam);

    const res = await agent.get('/api/games/620/achievements').expect(200);
    expect(res.body.achievements).toHaveLength(8);
    expect(res.body.achievements[0].rarityPercent).toBeNull();
  });

  it('U12: filtras pagal būseną; progresas skaičiuojamas iš visų pasiekimų', async () => {
    const { agent } = await openGame();

    const locked = await agent.get('/api/games/620/achievements?status=locked').expect(200);
    expect(locked.body.filtered).toBe(true);
    expect(apiNames(locked.body)).toEqual(['ACH_4', 'ACH_5', 'ACH_6', 'ACH_7', 'ACH_8']);
    expect(locked.body.progress).toEqual({ unlocked: 3, total: 8, percent: 37.5 });

    const unlocked = await agent.get('/api/games/620/achievements?status=unlocked').expect(200);
    expect(apiNames(unlocked.body)).toEqual(['ACH_1', 'ACH_2', 'ACH_3']);
  });

  it('U12: filtrai pagal prieinamumą, sunkumą ir tipą; jie derinami tarpusavyje', async () => {
    const { agent } = await openGame();
    await setAttributes('ACH_4', { availability: 'PRIEINAMAS', difficulty: 'EASY', achievementType: 'STORY' });
    await setAttributes('ACH_5', { availability: 'PRIEINAMAS', difficulty: 'HARD', achievementType: 'COLLECTION' });
    await setAttributes('ACH_6', { availability: 'NEPRIEINAMAS', difficulty: 'HARD', achievementType: 'COLLECTION' });

    expect(apiNames((await agent.get('/api/games/620/achievements?availability=PRIEINAMAS').expect(200)).body)).toEqual(['ACH_4', 'ACH_5']);
    expect(apiNames((await agent.get('/api/games/620/achievements?difficulty=HARD').expect(200)).body)).toEqual(['ACH_5', 'ACH_6']);
    expect(apiNames((await agent.get('/api/games/620/achievements?type=COLLECTION').expect(200)).body)).toEqual(['ACH_5', 'ACH_6']);
    expect(apiNames((await agent.get('/api/games/620/achievements?availability=PRIEINAMAS&difficulty=HARD&status=locked').expect(200)).body))
      .toEqual(['ACH_5']);
  });

  it('U12: nieko nerasta – tuščias sąrašas su filtered=true, žaidimas vis tiek turi pasiekimų', async () => {
    const { agent } = await openGame();
    const res = await agent.get('/api/games/620/achievements?type=MULTIPLAYER').expect(200);
    expect(res.body).toMatchObject({ achievements: [], filtered: true, hasAchievements: true });
  });

  it('U13: rūšiavimas pagal retumą abiem kryptimis; be retumo – gale', async () => {
    const { agent } = await openGame();
    await setAttributes('ACH_5', { rarityPercent: null });

    const asc = await agent.get('/api/games/620/achievements?sort=rarity&order=asc').expect(200);
    expect(apiNames(asc.body)).toEqual(['ACH_8', 'ACH_7', 'ACH_6', 'ACH_4', 'ACH_3', 'ACH_2', 'ACH_1', 'ACH_5']);

    const desc = await agent.get('/api/games/620/achievements?sort=rarity&order=desc').expect(200);
    expect(apiNames(desc.body)).toEqual(['ACH_1', 'ACH_2', 'ACH_3', 'ACH_4', 'ACH_6', 'ACH_7', 'ACH_8', 'ACH_5']);
  });

  it('U13: rūšiavimas pagal sunkumą (EASY < MEDIUM < HARD < VERY_HARD); neįvertinti – gale', async () => {
    const { agent } = await openGame();
    await setAttributes('ACH_1', { difficulty: 'VERY_HARD' });
    await setAttributes('ACH_2', { difficulty: 'EASY' });
    await setAttributes('ACH_3', { difficulty: 'HARD' });
    await setAttributes('ACH_4', { difficulty: 'MEDIUM' });

    const asc = await agent.get('/api/games/620/achievements?sort=difficulty').expect(200);
    expect(apiNames(asc.body).slice(0, 4)).toEqual(['ACH_2', 'ACH_4', 'ACH_3', 'ACH_1']);

    const desc = await agent.get('/api/games/620/achievements?sort=difficulty&order=desc').expect(200);
    expect(apiNames(desc.body).slice(0, 4)).toEqual(['ACH_1', 'ACH_3', 'ACH_4', 'ACH_2']);
    expect(desc.body.achievements.slice(4).every((a: { difficulty: unknown }) => a.difficulty === null)).toBe(true);
  });

  it('U13: rūšiavimas pagal pavadinimą', async () => {
    const { agent } = await openGame();
    const desc = await agent.get('/api/games/620/achievements?sort=name&order=desc').expect(200);
    expect(desc.body.achievements[0].name).toBe('Pasiekimas 8');
    expect(desc.body.achievements[7].name).toBe('Pasiekimas 1');
  });

  it('API-10: neleistinos filtrų ir rūšiavimo reikšmės → 400', async () => {
    const { agent } = await openGame();
    for (const bad of ['status=done', 'availability=YES', 'difficulty=easy', 'type=RANDOM', 'sort=popularity', 'order=up', 'status=locked&status=unlocked']) {
      const res = await agent.get(`/api/games/620/achievements?${bad}`);
      expect(res.status, bad).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});