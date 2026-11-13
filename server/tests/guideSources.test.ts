import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuideRepo } from '../src/db/guideRepo.js';
import { createSourcesRepo } from '../src/db/sourcesRepo.js';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A, STEAM_ID_B } from './helpers.js';

describe('NI-4 / API-07 / DIS-04: išsaugoti vadovo šaltiniai', () => {
  beforeEach(resetDb);
  async function setup() {
    const ai = { explain: vi.fn(), guide: vi.fn(), help: vi.fn() };
    const collect = vi.fn();
    const app = createTestApp(createSteamMock(), { ai, sources: { collect } });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId: 220, name: 'Half-Life 2' } });
    await prisma.userGame.create({ data: { userId: user.id, appId: 220 } });
    await prisma.achievement.create({ data: { appId: 220, apiName: 'OTHER', name: 'Another achievement' } });
    const achievement = await prisma.achievement.create({ data: { appId: 220, apiName: 'CROWBAR', name: 'Trusty Hardware', description: 'Get the crowbar.' } });
    const signal = new AbortController().signal;
    const evidence = await createSourcesRepo(prisma).save(achievement.id, 'query', [1, 2, 3].map((id) => ({
      url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`, title: `Guide ${id}`, type: 'STEAM_GUIDE',
      excerpt: `Private stored excerpt ${id}.`, fetchedAt: new Date(`2026-01-0${id}T10:00:00Z`),
    })), signal);
    // Source 3 was collected but never used. Citation order differs from source IDs.
    const guide = await createGuideRepo(prisma).save(achievement.id, 'input', [
      { instruction: 'Collect the crowbar.', sourceIds: [evidence[1].id, evidence[0].id] },
    ], 'fake', [evidence[1], evidence[0]], signal);
    const generatedAt = new Date('2026-01-05T12:34:56Z');
    await prisma.guide.update({ where: { id: guide.id }, data: { createdAt: generatedAt } });
    return { app, agent, user, guide, evidence, ai, collect, generatedAt, url: `/api/guides/${guide.id}/sources` };
  }

  it('200: tik panaudoti šaltiniai citavimo tvarka, vadovo data ir tikros kopijų gavimo datos; be ištraukų ir DI', async () => {
    const { agent, url, guide, evidence, ai, collect, generatedAt } = await setup();
    // A later collection must not change the date of evidence actually used by this guide.
    await prisma.externalSource.updateMany({ data: { fetchedAt: new Date() } });
    const before = await prisma.guide.findUnique({ where: { id: guide.id }, include: { sources: true } });
    const expected = { guideId: guide.id, generatedAt: generatedAt.toISOString(), generatedByAi: true,
      sources: [evidence[1], evidence[0]].map(({ id, title, url, type, fetchedAt }) => ({ id, title, url, type, fetchedAt: fetchedAt.toISOString() })),
    };
    expect((await agent.get(url).expect('Content-Type', /json/).expect(200)).body).toEqual(expected);
    expect((await agent.get(url).expect(200)).body).toEqual(expected);
    expect(await prisma.guide.findUnique({ where: { id: guide.id }, include: { sources: true } })).toEqual(before);
    expect(ai.guide).not.toHaveBeenCalled(); expect(ai.help).not.toHaveBeenCalled(); expect(ai.explain).not.toHaveBeenCalled();
    expect(collect).not.toHaveBeenCalled();
  });
  it('401: neprisijungęs negauna net egzistuojančio vadovo šaltinių', async () => {
    const { app, url } = await setup();
    expect((await request(app).get(url).expect(401)).body).toEqual({ error: { code: 'UNAUTHORIZED' } });
    await request(app).get('/api/guides/not-an-id/sources').expect(401);
  });
  it('404: svetimas ir neegzistuojantis vadovas neatskiriami; perduotas naudotojo ID prieigos nesuteikia', async () => {
    const { app, agent, user, url } = await setup();
    const other = await loginAs(app, STEAM_ID_B);
    const denied = (await other.agent.get(url).query({ userId: user.id, steamId: STEAM_ID_A, appId: 220 }).expect(404)).body;
    expect(denied).toEqual({ error: { code: 'NOT_FOUND' } });
    expect((await other.agent.get('/api/guides/2147483647/sources').expect(404)).body).toEqual(denied);
    expect((await agent.get('/api/guides/2147483647/sources').expect(404)).body).toEqual(denied);
  });
  it('bendras vadovas prieinamas kitam to paties žaidimo savininkui ir po naujos serverio instancijos', async () => {
    const { agent, url } = await setup();
    const expected = (await agent.get(url).expect(200)).body;
    const app = createTestApp(createSteamMock()); // No model or collector needed to read saved sources.
    const other = await loginAs(app, STEAM_ID_B);
    await prisma.userGame.create({ data: { userId: other.user.id, appId: 220 } });
    expect((await other.agent.get(url).expect(200)).body).toEqual(expected);
  });
  it('pašalinus žaidimą iš bibliotekos, ankstesnė prieiga nebegalioja', async () => {
    const { agent, user, url } = await setup();
    await agent.get(url).expect(200);
    await prisma.userGame.delete({ where: { userId_appId: { userId: user.id, appId: 220 } } });
    await agent.get(url).expect(404);
  });
  it.each(['0', '-1', '1.5', '1e0', 'abc', '2147483648', '9007199254740993'])('400: netinkamas vadovo ID %s', async (id) => {
    const { agent } = await setup();
    expect((await agent.get(`/api/guides/${id}/sources`).expect(400)).body).toEqual({ error: { code: 'VALIDATION_ERROR' } });
  });
  it('404: nepatikimos informacijos įrašas nelaikomas parengtu vadovu', async () => {
    const { agent, guide, url } = await setup();
    await prisma.guide.update({ where: { id: guide.id }, data: { hasReliableInfo: false } });
    await agent.get(url).expect(404);
  });
  it('sugadinta neleistino URL nuoroda negrąžinama klientui', async () => {
    const { agent, evidence, url } = await setup();
    await prisma.externalSource.update({ where: { id: evidence[0].id }, data: { url: 'javascript:alert(1)' } });
    expect((await agent.get(url).expect(502)).body).toEqual({ error: { code: 'AI_INVALID_RESPONSE' } });
  });
});
