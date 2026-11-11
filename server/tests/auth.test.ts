import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { upsertUserBySteamId } from '../src/db/userRepo.js';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A } from './helpers.js';

// NI-1: prisijungimas ir atsijungimas
describe('NI-1 prisijungimas / atsijungimas', () => {
  beforeEach(resetDb);

  it('FR-01: /auth/steam nukreipia į Steam OpenID', async () => {
    const app = createTestApp(createSteamMock());
    const res = await request(app).get('/auth/steam').expect(302);
    expect(res.headers.location).toMatch(/^https:\/\/steamcommunity\.com\/openid\/login\?/);
    expect(res.headers.location).toContain('openid.mode=checkid_setup');
  });

  it('FR-01: atšauktas / netikras Steam atsakymas – grįžtama su klaida, sesija nesukuriama', async () => {
    const app = createTestApp(createSteamMock());
    const res = await request(app).get('/auth/steam/return?openid.mode=cancel').expect(302);
    expect(res.headers.location).toBe('http://localhost:5173/?klaida=AUTH_FAILED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('FR-02: tas pats SteamID visada naudoja tą patį naudotojo įrašą', async () => {
    const profile = { personaName: 'Žaidėjas', avatarUrl: null, profilePublic: true };
    const first = await upsertUserBySteamId(prisma, STEAM_ID_A, profile);
    const second = await upsertUserBySteamId(prisma, STEAM_ID_A, { ...profile, personaName: 'Naujas vardas' });

    expect(second.id).toBe(first.id);
    expect(await prisma.user.count({ where: { steamId: STEAM_ID_A } })).toBe(1);
    expect(second.personaName).toBe('Naujas vardas');
  });

  it('FR-03: be sesijos apsaugoti endpointai grąžina 401', async () => {
    const app = createTestApp(createSteamMock());
    for (const [method, url] of [
      ['get', '/api/me'],
      ['get', '/api/games'],
      ['get', '/api/games/620/achievements'],
      ['post', '/api/sync'],
      ['post', '/api/games/620/sync'],
    ] as const) {
      const res = await request(app)[method](url);
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('FR-03: atsijungus sesija sunaikinama ir duomenys nebepasiekiami', async () => {
    const app = createTestApp(createSteamMock());
    const { agent } = await loginAs(app, STEAM_ID_A);

    const me = await agent.get('/api/me').expect(200);
    expect(me.body.steamId).toBe(STEAM_ID_A); // SteamID – eilutė, ne skaičius
    expect(typeof me.body.steamId).toBe('string');

    await agent.post('/auth/logout').expect(204);
    await agent.get('/api/me').expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('FR-04: privatus profilis pažymimas /api/me atsakyme', async () => {
    const app = createTestApp(createSteamMock());
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.user.update({ where: { id: user.id }, data: { profilePublic: false } });

    const me = await agent.get('/api/me').expect(200);
    expect(me.body.profilePrivate).toBe(true);
  });
});
