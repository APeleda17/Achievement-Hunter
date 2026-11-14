import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSteamClient } from '../src/steam/steamClient.js';
import { createRarityService, RARITY_MAX_AGE_MS } from '../src/achievements/rarityService.js';
import { createSteamMock, prisma, resetDb, steamDown } from './helpers.js';

// 3 sprintas, 2 užduotis: pasiekimų retumas (SDG-05, PAS-05)

async function seedGame() {
  await prisma.game.create({ data: { appId: 620, name: 'Portal 2' } });
  for (const apiName of ['ACH_1', 'ACH_2', 'ACH_3']) {
    await prisma.achievement.create({ data: { appId: 620, apiName, name: apiName } });
  }
}

const rarityOf = async (apiName: string) =>
  (await prisma.achievement.findUniqueOrThrow({ where: { appId_apiName: { appId: 620, apiName } } })).rarityPercent;

describe('SDG-05: Steam klientas – GetGlobalAchievementPercentagesForApp', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('grąžina procentus pagal apiName; eilutė "12.5" paverčiama skaičiumi', async () => {
    const fetchMock = stubFetch(200, {
      achievementpercentages: { achievements: [{ name: 'ACH_1', percent: 71.3 }, { name: 'ACH_2', percent: '12.5' }] },
    });

    const result = await createSteamClient('raktas').getGlobalAchievementPercentages(620);

    expect(result).toEqual(new Map([['ACH_1', 71.3], ['ACH_2', 12.5]]));
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/');
    expect(url.searchParams.get('gameid')).toBe('620');
  });

  it('žaidimas be statistikos (403) – tuščias rezultatas, ne klaida', async () => {
    stubFetch(403, {});
    expect(await createSteamClient('raktas').getGlobalAchievementPercentages(999)).toEqual(new Map());
  });
});

describe('PAS-05: retumo atnaujinimas ne dažniau kaip kas 24 h', () => {
  beforeEach(resetDb);

  it('nėra duomenų – kviečia Steam ir išsaugo retumą', async () => {
    await seedGame();
    const steam = createSteamMock();

    expect(await createRarityService(prisma, steam).ensureFresh(620)).toBe('UPDATED');

    expect(steam.getGlobalAchievementPercentages).toHaveBeenCalledWith(620);
    expect(await rarityOf('ACH_1')).toBe(90);
    expect(await rarityOf('ACH_3')).toBe(70);
  });

  it('duomenys šviežesni nei 24 h – Steam nekviečiamas', async () => {
    await seedGame();
    const steam = createSteamMock();
    const service = createRarityService(prisma, steam);
    await service.ensureFresh(620);
    steam.getGlobalAchievementPercentages.mockClear();

    expect(await service.ensureFresh(620)).toBe('FRESH');
    expect(steam.getGlobalAchievementPercentages).not.toHaveBeenCalled();
  });

  it('duomenys senesni nei 24 h – atnaujinami', async () => {
    await seedGame();
    const steam = createSteamMock();
    await createRarityService(prisma, steam).ensureFresh(620);

    const later = new Date(Date.now() + RARITY_MAX_AGE_MS + 60_000);
    steam.getGlobalAchievementPercentages.mockResolvedValue(new Map([['ACH_1', 5], ['ACH_2', 4], ['ACH_3', 3]]));

    expect(await createRarityService(prisma, steam, () => later).ensureFresh(620)).toBe('UPDATED');
    expect(await rarityOf('ACH_1')).toBe(5);
  });

  it('Steam nepasiekiamas – seni duomenys lieka, klaida nemetama', async () => {
    await seedGame();
    const steam = createSteamMock();
    await createRarityService(prisma, steam).ensureFresh(620);

    const later = new Date(Date.now() + RARITY_MAX_AGE_MS + 60_000);
    steam.getGlobalAchievementPercentages.mockRejectedValue(steamDown());

    expect(await createRarityService(prisma, steam, () => later).ensureFresh(620)).toBe('STEAM_UNAVAILABLE');
    expect(await rarityOf('ACH_1')).toBe(90);
  });

  it('Steam negrąžino kai kurių pasiekimų – jie nekviečia Steam kiekvieną kartą', async () => {
    await seedGame();
    const steam = createSteamMock();
    steam.getGlobalAchievementPercentages.mockResolvedValue(new Map([['ACH_1', 50]]));
    const service = createRarityService(prisma, steam);

    await service.ensureFresh(620);
    expect(await rarityOf('ACH_2')).toBeNull();

    expect(await service.ensureFresh(620)).toBe('FRESH');
    expect(steam.getGlobalAchievementPercentages).toHaveBeenCalledTimes(1);
  });
});