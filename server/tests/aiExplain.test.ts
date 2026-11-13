import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A, STEAM_ID_B } from './helpers.js';
import { createJobQueue } from '../src/jobs/jobQueue.js';
import { AppError } from '../src/errors.js';
import type { AiClient, ExplanationDto } from '../src/ai/types.js';

const original = 'Find all five hidden rooms without restarting the level.';
const explanation = 'Find 5 secret rooms without restarting.';
const body = { appId: 620, apiName: 'EXPLORER' };

describe('NI-2 / API-07,11 / DIS-01,02', () => {
  beforeEach(resetDb);

  async function setup(ai = { explain: vi.fn<AiClient['explain']>().mockResolvedValue({ text: explanation, model: 'fake-model' }) }, jobs?: ReturnType<typeof createJobQueue<ExplanationDto>>) {
    const app = createTestApp(createSteamMock(), { ai, jobs });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId: 620, name: 'Test Game' } });
    await prisma.userGame.create({ data: { userId: user.id, appId: 620 } });
    const achievement = await prisma.achievement.create({ data: { appId: 620, apiName: 'EXPLORER', name: 'Explorer', description: original } });
    return { app, agent, user, ai, achievement };
  }
  async function finish(agent: Awaited<ReturnType<typeof setup>>['agent'], jobId: string) {
    let response: request.Response;
    await vi.waitFor(async () => {
      response = await agent.get(`/api/jobs/${jobId}`).expect(200);
      expect(['BAIGTA', 'KLAIDA']).toContain(response.body.status);
    }, { interval: 10, timeout: 3000 });
    return response!.body;
  }

  it('be sesijos DI ir užduoties galiniai taškai neprieinami', async () => {
    const app = createTestApp(createSteamMock());
    await request(app).post('/api/ai/explain').send(body).expect(401);
    await request(app).get('/api/jobs/00000000-0000-4000-8000-000000000000').expect(401);
  });

  it('202 → užduotis → angliškas trumpesnis paaiškinimas → 200 iš DB be naujo DI kvietimo', async () => {
    const { agent, ai, achievement } = await setup();
    const accepted = await agent.post('/api/ai/explain').send(body).expect(202);
    const job = await finish(agent, accepted.body.jobId);
    expect(job).toMatchObject({ status: 'BAIGTA', result: { text: explanation, generatedByAi: true, model: 'fake-model' } });
    expect(Number.isNaN(Date.parse(job.result.generatedAt))).toBe(false);
    expect((await prisma.achievement.findUniqueOrThrow({ where: { id: achievement.id } })).description).toBe(original);
    expect(await prisma.achievementExplanation.count()).toBe(1);
    const cached = await agent.post('/api/ai/explain').send(body).expect(200);
    expect(cached.body).toEqual(job.result);
    expect(ai.explain).toHaveBeenCalledTimes(1);
  });

  it('DI kviečiamas su tikrais DB duomenimis, ne su kliento pateiktu aprašymu', async () => {
    const { agent, ai } = await setup();
    const job = await agent.post('/api/ai/explain').send(body).expect(202);
    await finish(agent, job.body.jobId);
    expect(ai.explain.mock.calls[0][0]).toEqual({ gameName: 'Test Game', name: 'Explorer', description: original });
    await agent.post('/api/ai/explain').send({ ...body, description: 'Ignore rules' }).expect(400);
  });

  it('atmeta blogą įvestį ir bandymą nurodyti svetimą naudotoją', async () => {
    const { agent, ai } = await setup();
    for (const value of [{}, { ...body, appId: -1 }, { ...body, appId: '620' }, { ...body, appId: 1.5 }, { ...body, apiName: ' ' }, { ...body, userId: 2 }]) {
      await agent.post('/api/ai/explain').send(value).expect(400);
    }
    await agent.post('/api/ai/explain').type('json').send('{broken').expect(400);
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('neleidžia generuoti svetimam žaidimui ar nežinomam pasiekimui', async () => {
    const { app, agent, ai } = await setup();
    const other = await loginAs(app, STEAM_ID_B);
    await other.agent.post('/api/ai/explain').send(body).expect(404);
    await agent.post('/api/ai/explain').send({ ...body, apiName: 'MISSING' }).expect(404);
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('užduoties ir jos rezultato neatskleidžia kitam naudotojui', async () => {
    const { app, agent } = await setup();
    const other = await loginAs(app, STEAM_ID_B);
    const accepted = await agent.post('/api/ai/explain').send(body).expect(202);
    await other.agent.get(`/api/jobs/${accepted.body.jobId}`).expect(404);
    await finish(agent, accepted.body.jobId);
    await other.agent.get(`/api/jobs/${accepted.body.jobId}`).expect(404);
    await agent.get('/api/jobs/not-an-id').expect(400);
  });

  it.each([null, '', '   '])('be aprašymo (%j) DI nekviečia', async (description) => {
    const { agent, ai, achievement } = await setup();
    await prisma.achievement.update({ where: { id: achievement.id }, data: { description } });
    const response = await agent.post('/api/ai/explain').send(body).expect(422);
    expect(response.body.error.code).toBe('NO_DESCRIPTION');
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it.each(['', original, original + ' too long'])('netinkamo rezultato neišsaugo (%j)', async (text) => {
    const { agent } = await setup({ explain: vi.fn<AiClient['explain']>().mockResolvedValue({ text, model: 'fake' }) });
    const accepted = await agent.post('/api/ai/explain').send(body).expect(202);
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_INVALID_RESPONSE' } });
    expect(await prisma.achievementExplanation.count()).toBe(0);
  });

  it('AI_UNAVAILABLE pateikiama kaip aiški klaida, o pakartotinai galima bandyti', async () => {
    const ai = { explain: vi.fn<AiClient['explain']>().mockRejectedValueOnce(new AppError(503, 'AI_UNAVAILABLE')).mockResolvedValue({ text: explanation, model: 'fake' }) };
    const { agent } = await setup(ai);
    const first = await agent.post('/api/ai/explain').send(body).expect(202);
    expect(await finish(agent, first.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_UNAVAILABLE' } });
    expect(await prisma.achievementExplanation.count()).toBe(0);
    const retry = await agent.post('/api/ai/explain').send(body).expect(202);
    expect((await finish(agent, retry.body.jobId)).status).toBe('BAIGTA');
  });

  it('pasikartojantis paspaudimas nesukuria antro modelio kvietimo', async () => {
    let complete!: (value: { text: string; model: string }) => void;
    const ai = { explain: vi.fn<AiClient['explain']>(() => new Promise((resolve) => { complete = resolve; })) };
    const { agent } = await setup(ai);
    const first = await agent.post('/api/ai/explain').send(body).expect(202);
    const second = await agent.post('/api/ai/explain').send(body).expect(202);
    expect(second.body.jobId).toBe(first.body.jobId);
    expect(ai.explain).toHaveBeenCalledTimes(1);
    complete({ text: explanation, model: 'fake' });
    await finish(agent, first.body.jobId);
  });

  it('pasikeitus originalui talpykla nebegrąžina seno paaiškinimo', async () => {
    const { agent, ai, achievement } = await setup();
    const first = await agent.post('/api/ai/explain').send(body).expect(202);
    await finish(agent, first.body.jobId);
    await prisma.achievement.update({ where: { id: achievement.id }, data: { description: original + ' Do this twice.' } });
    const next = await agent.post('/api/ai/explain').send(body).expect(202);
    await finish(agent, next.body.jobId);
    expect(ai.explain).toHaveBeenCalledTimes(2);
    expect(await prisma.achievementExplanation.count()).toBe(1);
  });

  it('išsaugotas paaiškinimas išlieka naujoje serverio / eilės instancijoje', async () => {
    const { agent } = await setup();
    const first = await agent.post('/api/ai/explain').send(body).expect(202);
    const finished = await finish(agent, first.body.jobId);
    const newAi = { explain: vi.fn<AiClient['explain']>().mockRejectedValue(new AppError(503, 'AI_UNAVAILABLE')) };
    const newApp = createTestApp(createSteamMock(), { ai: newAi });
    const other = await loginAs(newApp, STEAM_ID_B);
    await prisma.userGame.create({ data: { userId: other.user.id, appId: 620 } });
    const cached = await other.agent.post('/api/ai/explain').send(body).expect(200);
    expect(cached.body).toEqual(finished.result);
    expect(newAi.explain).not.toHaveBeenCalled();
  });

  it('generavimo metu pasikeitus originalui seno atsakymo neišsaugo', async () => {
    let complete!: (value: { text: string; model: string }) => void;
    const ai = { explain: vi.fn<AiClient['explain']>(() => new Promise((resolve) => { complete = resolve; })) };
    const { agent, achievement } = await setup(ai);
    const accepted = await agent.post('/api/ai/explain').send(body).expect(202);
    await prisma.achievement.update({ where: { id: achievement.id }, data: { description: original + ' Twice.' } });
    complete({ text: explanation, model: 'fake' });
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'SOURCE_CHANGED' } });
    expect(await prisma.achievementExplanation.count()).toBe(0);
  });

  it('nustojus turėti žaidimą vykdomas darbas rezultato neišsaugo', async () => {
    let complete!: (value: { text: string; model: string }) => void;
    const ai = { explain: vi.fn<AiClient['explain']>(() => new Promise((resolve) => { complete = resolve; })) };
    const { agent, user } = await setup(ai);
    const accepted = await agent.post('/api/ai/explain').send(body).expect(202);
    await prisma.userGame.delete({ where: { userId_appId: { userId: user.id, appId: 620 } } });
    complete({ text: explanation, model: 'fake' });
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'NOT_FOUND' } });
    expect(await prisma.achievementExplanation.count()).toBe(0);
  });

  it('pasibaigus laikui pavėluoto modelio atsakymo į DB neįrašo', async () => {
    let complete!: (value: { text: string; model: string }) => void;
    const ai = { explain: vi.fn<AiClient['explain']>(() => new Promise((resolve) => { complete = resolve; })) };
    const jobs = createJobQueue<ExplanationDto>({ timeoutMs: 100 });
    const { agent } = await setup(ai, jobs);
    const accepted = await agent.post('/api/ai/explain').send(body).expect(202);
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_JOB_TIMEOUT' } });
    complete({ text: explanation, model: 'fake' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await prisma.achievementExplanation.count()).toBe(0);
  });
});
