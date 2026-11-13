import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createOllamaClient } from '../src/ai/ollamaClient.js';
import { createSourcesRepo } from '../src/db/sourcesRepo.js';
import { createSourcesService } from '../src/sources/sourcesService.js';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A } from './helpers.js';

const cases = [
  [220, 'Half-Life 2', 'CROWBAR', 'Trusty Hardware', 'Get the crowbar.'],
  [220, 'Half-Life 2', 'BARNACLES', 'Barnacle Bowling', 'Kill five barnacles with one barrel.'],
  [220, 'Half-Life 2', 'DEFIANT', 'Defiant', null],
  [220, 'Half-Life 2', 'CAT', 'What cat?', null],
  [12210, 'Grand Theft Auto IV: The Complete Edition', 'BOAT', 'Off The Boat', 'Complete the first mission.'],
  [12210, 'Grand Theft Auto IV: The Complete Edition', 'TRINITY', 'Impossible Trinity', 'Complete mission "Museum Piece".'],
  [271590, 'Grand Theft Auto V Legacy', 'LOS_SANTOS', 'Welcome to Los Santos', null],
  [271590, 'Grand Theft Auto V Legacy', 'FRIENDSHIP', 'A Friendship Resurrected', null],
  [3240220, 'Grand Theft Auto V Enhanced', 'LOS_SANTOS_ENHANCED', 'Welcome to Los Santos', null],
  [3240220, 'Grand Theft Auto V Enhanced', 'FRIENDSHIP_ENHANCED', 'A Friendship Resurrected', null],
  [306020, 'Bloons TD5', 'HIGHLANDER', 'Highlander', 'Complete the There Can Only Be One Special Mission'],
  [306020, 'Bloons TD5', 'OLYMPIAN', '3 Times Around Olympian', 'Earn all 3 medals on 3 Times Around map'],
  [306020, 'Bloons TD5', 'DAILY', '4 of a Kind', 'Complete all daily challenges in one day.'],
  [311210, 'Call of Duty: Black Ops III', 'DISAVOWED', 'Disavowed', 'Complete Black Ops on Hardened, Veteran, or Realistic.'],
  [311210, 'Call of Duty: Black Ops III', 'BELLY', 'Belly of the Beast', 'Complete Provocation on Hardened, Veteran, or Realistic.'],
  [105600, 'Terraria', 'TIMBER', 'Timber!!', 'Chop down your first tree.'],
  [105600, 'Terraria', 'HOUSING', 'No Hobo', 'Build a house suitable enough for your first town NPC, such as the guide, to move into.'],
  [4000, "Garry's Mod", 'SINGLEPLAYER', 'Play Singleplayer', 'Play singleplayer at least once'],
  [550, 'Left 4 Dead 2', 'CLOWN', 'CL0WND', 'Honk the noses of 10 Clowns.'],
  [1794680, 'Vampire Survivors', 'WINGS', 'Wings', 'Reach Level 5.'],
  [2379780, 'Balatro', 'ANTE', 'Ante Up!', 'Reach Ante 4'],
] as const;
const selected = process.env.GUIDE_LIVE_APPS?.split(',').map(Number);
const report: unknown[] = [];
// Public Steam achievement labels, including neighbours not generated in a case.
const names: Record<string, string[]> = JSON.parse(readFileSync(new URL('./fixtures/guide-achievement-names.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));

// Opt-in real external pages + local Ollama; all data stays in the isolated test DB.
describe.skipIf(process.env.RUN_GUIDE_TESTS !== '1')('NI-3 tikri šaltiniai ir Ollama', () => {
  const collector = createSourcesService(createSourcesRepo(prisma));
  beforeEach(resetDb);
  it.each(cases.filter(([appId]) => !selected || selected.includes(appId)))('%s %s / %s: šaltiniai → DI → DB → talpykla', async (appId, gameName, apiName, name, description) => {
    const started = Date.now();
    const realAi = createOllamaClient({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', model: process.env.OLLAMA_MODEL ?? 'qwen3.5:9b' });
    const ai = { explain: realAi.explain, guide: vi.fn(realAi.guide) };
    const sources = { collect: vi.fn(collector.collect) };
    const app = createTestApp(createSteamMock(), { ai, sources });
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await prisma.game.create({ data: { appId, name: gameName } });
    await prisma.userGame.create({ data: { userId: user.id, appId } });
    await prisma.achievement.create({ data: { appId, apiName, name, description } });
    // Real game achievement labels let extraction stop at adjacent achievements.
    const siblingNames = (names[String(appId)] ?? []).filter((title) => title !== name);
    await prisma.achievement.createMany({ data: siblingNames.map((title, i) => ({ appId, apiName: `SIBLING_${i}`, name: title })) });
    const accepted = await agent.post('/api/ai/guide').send({ appId, apiName }).expect(202);
    let completed: any;
    let terminal: any;
    await vi.waitFor(async () => {
      const response = await agent.get(`/api/jobs/${accepted.body.jobId}`).expect(200);
      expect(['BAIGTA', 'KLAIDA']).toContain(response.body.status);
      terminal = response.body;
    }, { timeout: 119000, interval: 500 });
    if (process.env.GUIDE_REPORT_PATH) {
      report.push({ appId, gameName, name, description, ms: Date.now() - started, ...terminal, evidence: ai.guide.mock.calls[0]?.[0].sources });
      writeFileSync(process.env.GUIDE_REPORT_PATH, JSON.stringify(report, null, 2));
    }
    expect(terminal.status, JSON.stringify(terminal)).toBe('BAIGTA');
    completed = terminal.result;
    expect(completed.steps.length).toBeGreaterThanOrEqual(1);
    expect(completed.sources.length).toBeGreaterThan(0);
    const lastStep = completed.steps.at(-1).instruction.toLowerCase();
    if (apiName === 'CROWBAR') {
      expect(lastStep).toMatch(/crowbar/);
      expect(lastStep).toMatch(/pick|collect|grab|take|retrieve|obtain|acquire/);
    }
    if (apiName === 'BARNACLES') {
      expect(completed.steps.map((step: any) => step.instruction).join(' ')).toMatch(/five|5/);
    }
    if (apiName === 'OLYMPIAN') {
      expect(completed.steps).toHaveLength(1);
      expect(completed.steps[0].instruction).not.toMatch(/first level|second level|third level/i);
    }
    if (apiName.startsWith('LOS_SANTOS')) {
      expect(completed.steps.map((step: any) => step.instruction).join(' ')).not.toMatch(/Fame or Shame|Caida Libre|Blitz Play|Bury the Hatchet/i);
    }
    if (apiName === 'DISAVOWED') {
      const text = completed.steps.map((step: any) => step.instruction).join(' ');
      expect(text).toMatch(/Black Ops/i);
      expect(text).toMatch(/mission/i);
      expect(text).not.toMatch(/(?:entire|whole|full) campaign/i);
    }
    expect(completed.steps.every((step: any) => step.sourceIds.every((id: number) => completed.sources.some((source: any) => source.id === id)))).toBe(true);
    expect(await prisma.guide.count()).toBe(1);
    expect((await agent.post('/api/ai/guide').send({ appId, apiName }).expect(200)).body).toEqual(completed);
    expect(ai.guide).toHaveBeenCalledTimes(1);
    expect(sources.collect).toHaveBeenCalledTimes(1);
    console.log(JSON.stringify({ gameName, name, ...completed }));
  }, 125000);
});
