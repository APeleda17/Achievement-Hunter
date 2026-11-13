import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A, STEAM_ID_B } from './helpers.js';
import { createSourcesRepo } from '../src/db/sourcesRepo.js';
import { createJobQueue } from '../src/jobs/jobQueue.js';
import type { AiResultDto, GuideAiClient } from '../src/ai/types.js';
import type { SourcesCollector } from '../src/sources/types.js';

const body = { appId: 220, apiName: 'CROWBAR' };
const candidate = { url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=123', title: 'Half-Life 2 guide', type: 'STEAM_GUIDE' as const,
  excerpt: 'Trusty Hardware. In Chapter 2 Barney calls from an elevated walkway. Wait underneath him until he drops the crowbar. Pick it up from the ground to unlock the achievement.' };
const steps = [{ instruction: 'Advance to the second chapter and stand below Barney on the walkway.', sourceIds: [1] },
  { instruction: 'Once Barney throws down the crowbar, collect it from where it lands.', sourceIds: [1] }];

describe('NI-3 / API-07,11 / DIS-03,04', () => {
  beforeEach(resetDb);
  async function setup() {
    const ai = { explain: vi.fn(), guide: vi.fn<GuideAiClient['guide']>().mockResolvedValue({ steps, model: 'fake' }) };
    const collect = vi.fn<SourcesCollector['collect']>(async (query, signal) => createSourcesRepo(prisma).save(query.achievementId, 'hash', [candidate], signal));
    const app = createTestApp(createSteamMock(), { ai, sources: { collect } });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId: 220, name: 'Half-Life 2' } });
    await prisma.userGame.create({ data: { userId: user.id, appId: 220 } });
    const achievement = await prisma.achievement.create({ data: { appId: 220, apiName: body.apiName, name: 'Trusty Hardware', description: 'Get the crowbar.' } });
    return { app, agent, user, ai, collect, achievement };
  }
  async function finish(agent: Awaited<ReturnType<typeof setup>>['agent'], jobId: string) {
    let result: request.Response;
    await vi.waitFor(async () => {
      result = await agent.get(`/api/jobs/${jobId}`).expect(200);
      expect(['BAIGTA', 'KLAIDA']).toContain(result.body.status);
    }, { timeout: 3000, interval: 10 });
    return result!.body;
  }
  async function generate(agent: Awaited<ReturnType<typeof setup>>['agent']) {
    const accepted = await agent.post('/api/ai/guide').send(body).expect(202);
    return finish(agent, accepted.body.jobId);
  }

  it('202 → šaltiniai → DI → žingsniai ir šaltinių datos DB → 200 be naujo rinkimo ar DI', async () => {
    const { agent, ai, collect, achievement } = await setup();
    const job = await generate(agent);
    expect(job).toMatchObject({ status: 'BAIGTA', result: { steps, generatedByAi: true, sources: [{ url: candidate.url }] } });
    expect(job.result.sources[0].excerpt).toBeUndefined();
    expect(Number.isNaN(Date.parse(job.result.sources[0].fetchedAt))).toBe(false);
    expect(await prisma.guide.count()).toBe(1);
    expect((await prisma.guideSource.findFirstOrThrow()).excerpt).toBe(candidate.excerpt);
    expect((await prisma.achievement.findUniqueOrThrow({ where: { id: achievement.id } })).description).toBe('Get the crowbar.');
    expect((await agent.post('/api/ai/guide').send(body).expect(200)).body).toEqual(job.result);
    expect(ai.guide).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledTimes(1);
  });
  it('DIS-03: kai šaltinių nėra, NEKVIEČIA modelio ir neįrašo vadovo', async () => {
    const { agent, ai, collect } = await setup();
    collect.mockResolvedValue([]);
    expect(await generate(agent)).toMatchObject({ status: 'KLAIDA', error: { code: 'NO_RELIABLE_INFO' } });
    expect(ai.guide).not.toHaveBeenCalled();
    expect(await prisma.guide.count()).toBe(0);
  });
  it('tikrina sesiją, nuosavybę ir atmeta savavališkus URL/aprašymą', async () => {
    const { app, agent, ai } = await setup();
    await request(app).post('/api/ai/guide').send(body).expect(401);
    const other = await loginAs(app, STEAM_ID_B);
    await other.agent.post('/api/ai/guide').send(body).expect(404);
    for (const invalid of [{ ...body, appId: '220' }, { ...body, url: 'http://localhost' }, { ...body, description: 'injected' }, { ...body, apiName: '' }]) {
      await agent.post('/api/ai/guide').send(invalid).expect(400);
    }
    const accepted = await agent.post('/api/ai/guide').send(body).expect(202);
    await other.agent.get(`/api/jobs/${accepted.body.jobId}`).expect(404);
    await finish(agent, accepted.body.jobId);
    expect(ai.guide).toHaveBeenCalledTimes(1);
  });
  it('vadovas išlieka naujoje programos instancijoje ir neatskleidžiamas žaidimo neturinčiam naudotojui', async () => {
    const { agent } = await setup();
    const job = await generate(agent);
    const ai = { explain: vi.fn(), guide: vi.fn() };
    const collect = vi.fn();
    const app = createTestApp(createSteamMock(), { ai, sources: { collect } });
    const other = await loginAs(app, STEAM_ID_B);
    await other.agent.post('/api/ai/guide').send(body).expect(404);
    await prisma.userGame.create({ data: { userId: other.user.id, appId: 220 } });
    expect((await other.agent.post('/api/ai/guide').send(body).expect(200)).body).toEqual(job.result);
    expect(ai.guide).not.toHaveBeenCalled();
    expect(collect).not.toHaveBeenCalled();
  });
  it.each(['description', 'expiry', 'sourceExpiry', 'corruption'])('negrąžina pasenusio ar sugadinto vadovo: %s', async (change) => {
    const { agent, ai, achievement } = await setup();
    await generate(agent);
    const old = new Date(Date.now() - 31 * 86400000);
    if (change === 'description') await prisma.achievement.update({ where: { id: achievement.id }, data: { description: 'Get the crowbar from Barney.' } });
    if (change === 'expiry') await prisma.guide.updateMany({ data: { createdAt: old } });
    if (change === 'sourceExpiry') await prisma.guideSource.updateMany({ data: { fetchedAt: old } });
    if (change === 'corruption') await prisma.guide.updateMany({ data: { steps: [{ instruction: 'Invented', sourceIds: [999] }] } });
    expect((await generate(agent)).status).toBe('BAIGTA');
    expect(ai.guide).toHaveBeenCalledTimes(2);
    expect(await prisma.guide.count()).toBe(1);
  });
  it('veikia ir be originalaus aprašo; naudoja tik DB žaidimo ir pasiekimo duomenis', async () => {
    const { agent, ai, achievement } = await setup();
    await prisma.achievement.update({ where: { id: achievement.id }, data: { description: null } });
    expect((await generate(agent)).status).toBe('BAIGTA');
    expect(ai.guide.mock.calls[0][0]).toMatchObject({ gameName: 'Half-Life 2', name: 'Trusty Hardware', description: '', sources: [{ excerpt: candidate.excerpt }] });
  });
  it('pakartotinis paspaudimas nesukuria dviejų generavimų; pakeitus originalą neišsaugo seno rezultato', async () => {
    const { agent, ai, achievement } = await setup();
    let resolve!: (value: { steps: typeof steps; model: string }) => void;
    ai.guide.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = await agent.post('/api/ai/guide').send(body).expect(202);
    await vi.waitFor(() => expect(ai.guide).toHaveBeenCalledTimes(1));
    const second = await agent.post('/api/ai/guide').send(body).expect(202);
    expect(second.body.jobId).toBe(first.body.jobId);
    await prisma.achievement.update({ where: { id: achievement.id }, data: { description: 'Changed condition.' } });
    resolve({ steps, model: 'fake' });
    expect(await finish(agent, first.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'SOURCE_CHANGED' } });
    expect(await prisma.guide.count()).toBe(0);
  });
  it('netinkamos citatos ar nukopijuoto teksto neišsaugo', async () => {
    const { agent, ai } = await setup();
    ai.guide.mockResolvedValue({ steps: steps.map((step) => ({ ...step, sourceIds: [999] })), model: 'fake' });
    expect(await generate(agent)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_INVALID_RESPONSE' } });
    ai.guide.mockResolvedValue({ steps: [{ instruction: candidate.excerpt, sourceIds: [1] }, steps[0]], model: 'fake' });
    expect(await generate(agent)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_INVALID_RESPONSE' } });
    expect(await prisma.guide.count()).toBe(0);
  });
  it('pasibaigus eilės laikui pavėluoto rezultato neišsaugo', async () => {
    const { ai, collect, achievement } = await setup();
    let resolve!: (value: { steps: typeof steps; model: string }) => void;
    ai.guide.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const app = createTestApp(createSteamMock(), { ai, sources: { collect }, jobs: createJobQueue<AiResultDto>({ timeoutMs: 150 }) });
    const other = await loginAs(app, STEAM_ID_B);
    await prisma.userGame.create({ data: { userId: other.user.id, appId: achievement.appId } });
    const accepted = await other.agent.post('/api/ai/guide').send(body).expect(202);
    await vi.waitFor(() => expect(ai.guide).toHaveBeenCalledTimes(1));
    expect(await finish(other.agent, accepted.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_JOB_TIMEOUT' } });
    resolve({ steps, model: 'fake' });
    await new Promise((done) => setTimeout(done, 20));
    expect(await prisma.guide.count()).toBe(0);
  });
});
