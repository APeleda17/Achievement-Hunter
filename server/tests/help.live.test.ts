import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOllamaClient } from '../src/ai/ollamaClient.js';
import { createSourcesRepo } from '../src/db/sourcesRepo.js';
import { createSourcesService } from '../src/sources/sourcesService.js';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A } from './helpers.js';

const names: Record<string, string[]> = JSON.parse(readFileSync(new URL('./fixtures/guide-achievement-names.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
describe.skipIf(process.env.RUN_HELP_TESTS !== '1')('NI-5 tikri šaltiniai ir vietinė Ollama', () => {
  const collector = createSourcesService(createSourcesRepo(prisma));
  beforeEach(resetDb);
  it.each([
    [220, 'Half-Life 2', 'Barnacle Bowling', 'Kill five barnacles with one barrel.', 'I kill only two barnacles when the barrel explodes. How can I get five at once?'],
    [311210, 'Call of Duty: Black Ops III', 'Disavowed', 'Complete Black Ops on Hardened, Veteran, or Realistic.', 'I finished Black Ops on Recruit, but the achievement did not unlock.'],
    [3240220, 'Grand Theft Auto V Enhanced', 'Welcome to Los Santos', '', 'I finished the prologue, but Welcome to Los Santos has not unlocked.'],
    [220, 'Half-Life 2', 'Trusty Hardware', 'Get the crowbar.', 'Barney numetė laužtuvą, bet pasiekimas neatsirado. Ką dar turiu padaryti?'],
  ] as const)('%s %s / %s', async (appId, gameName, name, description, problem) => {
    const real = createOllamaClient({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', model: process.env.OLLAMA_MODEL ?? 'qwen3.5:9b',
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        if (process.env.DEBUG_HELP_TESTS === '1') {
          const body = await response.clone().json();
          console.log(JSON.stringify({ draftFor: name, content: body.message?.content }));
        }
        return response;
      } });
    const ai = { explain: real.explain, help: vi.fn(real.help) };
    const app = createTestApp(createSteamMock(), { ai, sources: collector });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId, name: gameName } });
    await prisma.userGame.create({ data: { userId: user.id, appId } });
    await prisma.achievement.create({ data: { appId, apiName: 'LIVE_HELP', name, description: description || null } });
    await prisma.achievement.createMany({ data: (names[String(appId)] ?? []).filter((title) => title !== name).map((title, index) => ({ appId, apiName: `SIBLING_${index}`, name: title })) });
    const input = { appId, apiName: 'LIVE_HELP', problem };
    const accepted = await agent.post('/api/ai/help').send(input).expect(202);
    let terminal: any;
    await vi.waitFor(async () => {
      const response = await agent.get(`/api/jobs/${accepted.body.jobId}`).expect(200);
      expect(['BAIGTA', 'KLAIDA']).toContain(response.body.status);
      terminal = response.body;
    }, { timeout: 119000, interval: 500 });
    expect(terminal.status, JSON.stringify(terminal)).toBe('BAIGTA');
    expect(terminal.result.causes.length).toBeGreaterThan(0); expect(terminal.result.steps.length).toBeGreaterThan(0);
    expect(terminal.result.sources.length).toBeGreaterThan(0);
    const text = JSON.stringify(terminal.result);
    if (name === 'Disavowed') { expect(text).toMatch(/Hardened|Veteran|Realistic/i); expect(text).toMatch(/mission/i); expect(text).not.toMatch(/(?:entire|whole|full) campaign/i); }
    if (name === 'Barnacle Bowling') expect(text).toMatch(/five|5/);
    if (name === 'Welcome to Los Santos') expect(text).toMatch(/Franklin|Lamar/i);
    if (name === 'Trusty Hardware') expect(text).not.toMatch(/interaction key|typically E|immediately/i);
    expect(await prisma.helpRequest.count()).toBe(1);
    expect((await agent.post('/api/ai/help').send(input).expect(200)).body).toEqual(terminal.result);
    const saved = await agent.get(`/api/ai/help?appId=${appId}&apiName=LIVE_HELP`).expect(200);
    expect(saved.body.requests).toEqual([terminal.result]);
    expect(ai.help).toHaveBeenCalledTimes(1);
    console.log(JSON.stringify({ gameName, name, problem, result: terminal.result }));
  }, 125000);
});
