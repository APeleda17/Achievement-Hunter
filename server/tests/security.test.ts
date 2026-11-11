import { beforeEach, describe, expect, it } from 'vitest';
import { createSteamMock, createTestApp, loginAs, resetDb, STEAM_ID_A, STEAM_ID_B } from './helpers.js';

// FR-14: naudotojas gauna tik savo duomenis. userId imamas tik iš sesijos.
describe('FR-14 kito naudotojo duomenų gauti negalima', () => {
  beforeEach(resetDb);

  async function twoUsers() {
    const steam = createSteamMock();
    const app = createTestApp(steam);
    const a = await loginAs(app, STEAM_ID_A);
    const b = await loginAs(app, STEAM_ID_B);
    await a.agent.get('/api/games').expect(200);
    await b.agent.get('/api/games').expect(200);
    // B atidaro savo žaidimą – jo pasiekimai dabar yra DB
    await b.agent.get('/api/games/730/achievements').expect(200);
    return { steam, a, b };
  }

  it('kiekvienas naudotojas mato tik savo biblioteką', async () => {
    const { a, b } = await twoUsers();
    const listA = await a.agent.get('/api/games').expect(200);
    const listB = await b.agent.get('/api/games').expect(200);

    expect(listA.body.games.map((g: { appId: number }) => g.appId)).not.toContain(730);
    expect(listB.body.games.map((g: { appId: number }) => g.appId)).toEqual([730]);
  });

  it('A negali gauti B žaidimo pasiekimų (404, ne B duomenys)', async () => {
    const { a } = await twoUsers();
    const res = await a.agent.get('/api/games/730/achievements').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND' } });
  });

  it('A negali atnaujinti B žaidimo', async () => {
    const { a, steam } = await twoUsers();
    steam.getSchemaForGame.mockClear();
    await a.agent.post('/api/games/730/sync').expect(404);
    expect(steam.getSchemaForGame).not.toHaveBeenCalled();
  });

  it('userId / steamId URL parametruose ignoruojami', async () => {
    const { a, b } = await twoUsers();

    const games = await a.agent
      .get('/api/games')
      .query({ userId: b.user.id, steamId: STEAM_ID_B })
      .expect(200);
    expect(games.body.games.map((g: { appId: number }) => g.appId)).not.toContain(730);

    await a.agent.get('/api/games/730/achievements').query({ userId: b.user.id }).expect(404);

    const me = await a.agent.get('/api/me').query({ userId: b.user.id }).expect(200);
    expect(me.body.steamId).toBe(STEAM_ID_A);
  });

  it('atnaujinimas naudoja SteamID iš sesijos, ne iš užklausos', async () => {
    const { a, steam } = await twoUsers();
    steam.getOwnedGames.mockClear();
    await a.agent.post('/api/sync').query({ steamId: STEAM_ID_B }).send({ steamId: STEAM_ID_B }).expect(200);
    expect(steam.getOwnedGames).toHaveBeenCalledWith(STEAM_ID_A);
    expect(steam.getOwnedGames).not.toHaveBeenCalledWith(STEAM_ID_B);
  });
});
