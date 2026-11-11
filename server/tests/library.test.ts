import { beforeEach, describe, expect, it } from 'vitest';
import { createSteamMock, createTestApp, loginAs, resetDb, STEAM_ID_A } from './helpers.js';

// NI-6: žaidimų biblioteka
describe('NI-6 žaidimų biblioteka', () => {
  beforeEach(resetDb);

  it('FR-05: pirmą kartą sąrašas gaunamas iš Steam (tik sąrašas, be pasiekimų)', async () => {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);

    const res = await agent.get('/api/games').expect(200);

    expect(res.body.games).toHaveLength(4);
    // Rikiuojama pagal pavadinimą
    expect(res.body.games.map((g: { name: string }) => g.name)).toEqual([
      'Be pasiekimų',
      'Half-Life 2',
      'Portal 2',
      'Team Fortress 2',
    ]);
    expect(res.body.games[1]).toMatchObject({ appId: 220, name: 'Half-Life 2', progressPercent: null });
    expect(typeof res.body.games[1].appId).toBe('number');
    expect(res.body.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/); // ISO 8601 UTC
    expect(steam.getOwnedGames).toHaveBeenCalledTimes(1);
    expect(steam.getSchemaForGame).not.toHaveBeenCalled();
  });

  it('FR-05: vėliau sąrašas imamas iš DB, Steam nekviečiamas', async () => {
    const steam = createSteamMock();
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);

    await agent.get('/api/games').expect(200);
    await agent.get('/api/games').expect(200);
    expect(steam.getOwnedGames).toHaveBeenCalledTimes(1);
  });

  describe('FR-06: paieška pagal pavadinimo dalį', () => {
    async function searchNames(query: string) {
      const { agent } = await loginAs(createTestApp(createSteamMock()), STEAM_ID_A);
      const res = await agent.get('/api/games').query({ search: query }).expect(200);
      return res.body.games.map((g: { name: string }) => g.name);
    }

    it('randa nepriklausomai nuo raidžių dydžio', async () => {
      expect(await searchNames('port')).toEqual(['Portal 2']);
      await resetDb();
      expect(await searchNames('PORT')).toEqual(['Portal 2']);
      await resetDb();
      expect(await searchNames('pOrTaL 2')).toEqual(['Portal 2']);
    });

    it('randa pagal dalį vidury pavadinimo', async () => {
      expect(await searchNames('life')).toEqual(['Half-Life 2']);
    });

    it('tuščia paieška grąžina visus žaidimus', async () => {
      expect(await searchNames('')).toHaveLength(4);
      await resetDb();
      expect(await searchNames('   ')).toHaveLength(4);
    });

    it('neradus – tuščias sąrašas (ne klaida)', async () => {
      expect(await searchNames('neegzistuojantis')).toEqual([]);
    });
  });

  it('FR-04: tuščias GetOwnedGames atsakas → 403 PROFILE_PRIVATE', async () => {
    const steam = createSteamMock();
    steam.getOwnedGames.mockResolvedValue(null);
    const { agent } = await loginAs(createTestApp(steam), STEAM_ID_A);

    const res = await agent.get('/api/games').expect(403);
    expect(res.body.error.code).toBe('PROFILE_PRIVATE');
  });
});
