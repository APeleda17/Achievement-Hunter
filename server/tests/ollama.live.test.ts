import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOllamaClient, characterCount } from '../src/ai/ollamaClient.js';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A } from './helpers.js';

// Opt-in tikros Ollama patikra. Vis tiek naudojama TIK atskira testinė DB.
// RUN_OLLAMA_TESTS=1 npm test --prefix server -- ollama.live.test.ts
describe.skipIf(process.env.RUN_OLLAMA_TESTS !== '1')('NI-2 tikras vietinis Ollama modelis', () => {
  beforeEach(resetDb);
  it('202 → tikras modelis → DB → 200 net modelio pakaitalui nebeveikiant', async () => {
    const realAi = createOllamaClient({
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL ?? 'qwen3.5:9b',
    });
    const ai = { explain: vi.fn(realAi.explain) };
    const app = createTestApp(createSteamMock(), { ai });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId: 620, name: 'Test Game' } });
    await prisma.userGame.create({ data: { userId: user.id, appId: 620 } });
    const original = 'Find all five hidden rooms without restarting the level.';
    await prisma.achievement.create({ data: { appId: 620, apiName: 'LIVE_EXPLORER', name: 'Explorer', description: original } });
    const input = { appId: 620, apiName: 'LIVE_EXPLORER' };
    const accepted = await agent.post('/api/ai/explain').send(input).expect(202);
    let completed: { result: { text: string; generatedByAi: boolean } };
    await vi.waitFor(async () => {
      const response = await agent.get(`/api/jobs/${accepted.body.jobId}`).expect(200);
      if (response.body.status === 'KLAIDA') throw new Error(response.body.error.code);
      expect(response.body.status).toBe('BAIGTA');
      completed = response.body;
    }, { timeout: 115_000, interval: 500 });
    expect(characterCount(completed!.result.text)).toBeLessThan(characterCount(original));
    expect(completed!.result.generatedByAi).toBe(true);
    expect(await prisma.achievementExplanation.count()).toBe(1);
    ai.explain.mockRejectedValue(new Error('Model unavailable after generation'));
    const cached = await agent.post('/api/ai/explain').send(input).expect(200);
    expect(cached.body).toEqual(completed!.result);
    expect(ai.explain).toHaveBeenCalledTimes(1);
    console.log(JSON.stringify({ original, explanation: completed!.result.text }));
  }, 120_000);
});
