import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A, STEAM_ID_B } from './helpers.js';
import { createSourcesRepo } from '../src/db/sourcesRepo.js';
import { createOllamaClient } from '../src/ai/ollamaClient.js';
import { validateAssessment } from '../src/ai/ollamaAssess.js';
import { AppError } from '../src/errors.js';
import type { AssessmentAiClient } from '../src/ai/types.js';
import type { GuideEvidence, SourcesCollector } from '../src/sources/types.js';

// 3 sprintas, 3 užduotis: NI-9 prieinamumo ir sunkumo įvertinimas (PRI-01..03, DIS-06)

const body = { appId: 440, apiName: 'TF_HALLOWEEN' };
const candidate = { url: 'https://wiki.teamfortress.com/wiki/Obtaining_achievements', title: 'TF2 achievements', type: 'WIKI' as const,
  excerpt: 'Spooky Event. This achievement could only be earned during the 2009 Halloween event and can no longer be obtained.' };
const assessment = { availability: 'UNAVAILABLE' as const, difficulty: 'MEDIUM' as const, achievementType: 'CHALLENGE' as const,
  reason: 'The source says it was limited to an event that has ended.', sourceIds: [1] };

describe('NI-9 / API-09: POST /api/ai/availability', () => {
  beforeEach(resetDb);

  async function setup() {
    const ai = { explain: vi.fn(), assess: vi.fn<AssessmentAiClient['assess']>(async (input) => ({
      ...assessment, sourceIds: input.sources.map((s) => s.id).slice(0, 1), model: 'fake' })) };
    const collect = vi.fn<SourcesCollector['collect']>(async (query, signal) =>
      createSourcesRepo(prisma).save(query.achievementId, 'hash', [candidate], signal));
    const app = createTestApp(createSteamMock(), { ai, sources: { collect } });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId: 440, name: 'Team Fortress 2' } });
    await prisma.userGame.create({ data: { userId: user.id, appId: 440 } });
    const achievement = await prisma.achievement.create({
      data: { appId: 440, apiName: body.apiName, name: 'Spooky Event', description: 'Collect the Halloween hat.' },
    });
    return { app, agent, ai, collect, achievement };
  }

  async function finish(agent: Awaited<ReturnType<typeof setup>>['agent'], jobId: string) {
    let result: request.Response;
    await vi.waitFor(async () => {
      result = await agent.get(`/api/jobs/${jobId}`).expect(200);
      expect(['BAIGTA', 'KLAIDA']).toContain(result.body.status);
    }, { timeout: 3000, interval: 10 });
    return result!.body;
  }

  it('PRI-02: 202 → šaltiniai → DI → išsaugoma; PRI-01: antrą kartą 200 be DI', async () => {
    const { agent, ai, collect, achievement } = await setup();

    const accepted = await agent.post('/api/ai/availability').send(body).expect(202);
    const job = await finish(agent, accepted.body.jobId);
    expect(job).toMatchObject({ status: 'BAIGTA', result: {
      availability: 'NEPRIEINAMAS', difficulty: 'MEDIUM', achievementType: 'CHALLENGE', generatedByAi: true, model: 'fake' } });

    const stored = await prisma.achievement.findUniqueOrThrow({ where: { id: achievement.id } });
    expect(stored).toMatchObject({ availability: 'NEPRIEINAMAS', difficulty: 'MEDIUM', assessmentModel: 'fake' });
    expect(stored.assessedAt).toBeInstanceOf(Date);

    const again = await agent.post('/api/ai/availability').send(body).expect(200);
    expect(again.body).toEqual(job.result);
    expect(ai.assess).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('šaltinių nerasta – DI vis tiek vertina pagal sąlygą, bet „Neprieinamas“ be šaltinio tampa „Nežinoma“', async () => {
    const { agent, ai, collect } = await setup();
    collect.mockResolvedValue([]);
    ai.assess.mockResolvedValue({ ...assessment, sourceIds: [], model: 'fake' });

    const accepted = await agent.post('/api/ai/availability').send(body).expect(202);
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'BAIGTA', result: { availability: 'NEZINOMA' } });
    expect(ai.assess).toHaveBeenCalledWith(expect.objectContaining({ sources: [] }), expect.anything());
  });

  it('šaltiniai nepasiekiami (SOURCES_UNAVAILABLE) – vertinama be jų, klaida nemetama', async () => {
    const { agent, collect } = await setup();
    collect.mockRejectedValue(new AppError(503, 'SOURCES_UNAVAILABLE'));

    const accepted = await agent.post('/api/ai/availability').send(body).expect(202);
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'BAIGTA', result: { availability: 'NEZINOMA' } });
  });

  it('DI nepasiekiamas – užduotis baigiasi klaida, niekas neišsaugoma', async () => {
    const { agent, ai, achievement } = await setup();
    ai.assess.mockRejectedValue(new AppError(503, 'AI_UNAVAILABLE'));

    const accepted = await agent.post('/api/ai/availability').send(body).expect(202);
    expect(await finish(agent, accepted.body.jobId)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_UNAVAILABLE' } });
    expect((await prisma.achievement.findUniqueOrThrow({ where: { id: achievement.id } })).availability).toBeNull();
  });

  it('FR-14: tikrina sesiją, žaidimo nuosavybę ir įvestį', async () => {
    const { app, agent } = await setup();
    await request(app).post('/api/ai/availability').send(body).expect(401);
    const other = await loginAs(app, STEAM_ID_B);
    await other.agent.post('/api/ai/availability').send(body).expect(404);
    for (const invalid of [{ ...body, appId: '440' }, { ...body, apiName: '' }, { ...body, availability: 'PRIEINAMAS' }]) {
      await agent.post('/api/ai/availability').send(invalid).expect(400);
    }
  });
});

describe('DIK: Ollama prieinamumo vertinimas', () => {
  const source: GuideEvidence = { id: 7, title: 'Wiki', url: 'https://wiki.teamfortress.com/wiki/X', type: 'WIKI', fetchedAt: new Date(),
    excerpt: 'This achievement was only available during an event that has ended.' };
  const input = { gameName: 'Game', name: 'Spooky', description: 'Collect the hat.', sources: [source] };
  const envelope = (value: unknown) => new Response(JSON.stringify({ done: true, message: { role: 'assistant', content: JSON.stringify(value) } }));
  const client = (send: typeof fetch) => createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'qwen3.5:9b', fetch: send });

  it('perduoda šaltinius be URL, naudoja JSON schemą ir grąžina patikrintą įvertinimą', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(envelope({ ...assessment, sourceIds: [7] }));
    expect(await client(send).assess(input, new AbortController().signal)).toMatchObject({ availability: 'UNAVAILABLE', sourceIds: [7], model: 'qwen3.5:9b' });
    const sent = JSON.parse(send.mock.calls[0][1]!.body as string);
    expect(sent.messages[0].content).toContain('untrusted data');
    expect(JSON.stringify(sent)).not.toContain(source.url);
    expect(sent).toMatchObject({ think: false, stream: false, options: { temperature: 0 } });
    expect(sent.format.properties.difficulty.enum).toEqual(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD']);
  });

  it('blogą atsakymą kartoja kartą, o po dviejų nepavykusių – AI_INVALID_RESPONSE', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async () => envelope({ ...assessment, difficulty: 'IMPOSSIBLE' }));
    await expect(client(send).assess(input, new AbortController().signal)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('Ollama neatsako – AI_UNAVAILABLE', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(client(send).assess(input, new AbortController().signal)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it.each([
    { ...assessment, sourceIds: [99] },
    { ...assessment, reason: 'short' },
    { ...assessment, achievementType: 'RANDOM' },
    { ...assessment, extra: true },
  ])('validateAssessment atmeta netinkamą atsakymą: %j', (value) => {
    expect(() => validateAssessment(value, [{ ...source, id: 1 }])).toThrow('AI_INVALID_RESPONSE');
  });

  it('„Neprieinamas“ be citatos paverčiamas „Nežinoma“', () => {
    expect(validateAssessment({ ...assessment, sourceIds: [] }, [source]).availability).toBe('UNKNOWN');
  });
});