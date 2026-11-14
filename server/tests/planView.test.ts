import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A, STEAM_ID_B } from './helpers.js';
import { createPlanRepo } from '../src/db/planRepo.js';


const repo = createPlanRepo(prisma);

describe('NI-13: GET /api/plans, GET /api/plans/:id, PATCH /api/plans/:id/items/:itemId', () => {
  beforeEach(resetDb);

  async function setup() {
    const app = createTestApp(createSteamMock());
    const { agent, user } = await loginAs(app, STEAM_ID_A);
    await agent.get('/api/games').expect(200);
    await agent.get('/api/games/620/achievements').expect(200);
    const achievementId = async (apiName: string) =>
      (await prisma.achievement.findUniqueOrThrow({ where: { appId_apiName: { appId: 620, apiName } } })).id;
    const plan = await repo.createPlan(user.id, 620, 'fake', { availableMinutes: 60 }, [
      { achievementId: await achievementId('ACH_4'), position: 1, estimatedMinutes: 20, justification: 'First item of the plan.' },
      { achievementId: await achievementId('ACH_5'), position: 2, estimatedMinutes: 30, justification: 'Second item of the plan.' },
    ]);
    return { app, agent, user, plan };
  }

  const unlock = (userId: number, apiName: string) => prisma.userAchievement.updateMany({
    where: { userId, achievement: { appId: 620, apiName } }, data: { status: 'ATRAKINTAS', unlockedAt: new Date() },
  });

  it('U16: plano peržiūra – kriterijai, punktai pagal eilę, progresas 0 %', async () => {
    const { agent, plan } = await setup();
    const res = await agent.get(`/api/plans/${plan.id}`).expect(200);

    expect(res.body).toMatchObject({
      id: plan.id, appId: 620, gameName: 'Portal 2', generatedByAi: true, totalMinutes: 50,
      criteria: { availableMinutes: 60, desiredDifficulty: null, achievementType: null },
      progress: { done: 0, total: 2, percent: 0 },
    });
    expect(res.body.items.map((i: { position: number; apiName: string; status: string }) => [i.position, i.apiName, i.status]))
      .toEqual([[1, 'ACH_4', 'NEATLIKTAS'], [2, 'ACH_5', 'NEATLIKTAS']]);
  });

  it('U16: atidarius planą, jau atrakinti pasiekimai automatiškai pažymimi atliktais', async () => {
    const { agent, user, plan } = await setup();
    await unlock(user.id, 'ACH_4');

    const res = await agent.get(`/api/plans/${plan.id}`).expect(200);
    expect(res.body.items[0]).toMatchObject({ apiName: 'ACH_4', status: 'ATLIKTAS', completedAt: expect.any(String) });
    expect(res.body.items[1]).toMatchObject({ status: 'NEATLIKTAS', completedAt: null });
    expect(res.body.progress).toEqual({ done: 1, total: 2, percent: 50 });
  });

  it('PLN-05: punktą galima pažymėti atliktu ir atžymėti', async () => {
    const { agent, plan } = await setup();
    const itemId = plan.items[1].id;

    const done = await agent.patch(`/api/plans/${plan.id}/items/${itemId}`).send({ status: 'ATLIKTAS' }).expect(200);
    expect(done.body.items[1]).toMatchObject({ status: 'ATLIKTAS', completedAt: expect.any(String) });
    expect(done.body.progress).toMatchObject({ done: 1, total: 2 });

    const undone = await agent.patch(`/api/plans/${plan.id}/items/${itemId}`).send({ status: 'NEATLIKTAS' }).expect(200);
    expect(undone.body.items[1]).toMatchObject({ status: 'NEATLIKTAS', completedAt: null });
  });

  it('NI-13: planų sąrašas – tik savi, naujausi pirmi, su progresu; filtras pagal appId', async () => {
    const { agent, user, plan } = await setup();
    const ach220 = await prisma.achievement.create({ data: { appId: 220, apiName: 'X', name: 'X' } });
    const newer = await repo.createPlan(user.id, 220, 'fake', { availableMinutes: 15 }, [
      { achievementId: ach220.id, position: 1, estimatedMinutes: 15, justification: 'Only item of this plan.' },
    ]);
    await repo.setItemStatus(user.id, newer.id, newer.items[0].id, 'DONE');

    const all = await agent.get('/api/plans').expect(200);
    expect(all.body.plans.map((p: { id: number }) => p.id)).toEqual([newer.id, plan.id]);
    expect(all.body.plans[0]).toMatchObject({ appId: 220, totalMinutes: 15, progress: { done: 1, total: 1, percent: 100 } });
    expect(all.body.plans[0].items).toBeUndefined();

    const only620 = await agent.get('/api/plans?appId=620').expect(200);
    expect(only620.body.plans.map((p: { id: number }) => p.id)).toEqual([plan.id]);
  });

  it('FR-14: be sesijos 401; kitas naudotojas plano nemato ir negali keisti', async () => {
    const { app, plan } = await setup();
    await request(app).get('/api/plans').expect(401);
    await request(app).get(`/api/plans/${plan.id}`).expect(401);

    const other = await loginAs(app, STEAM_ID_B);
    expect((await other.agent.get('/api/plans').expect(200)).body.plans).toEqual([]);
    await other.agent.get(`/api/plans/${plan.id}`).expect(404);
    await other.agent.patch(`/api/plans/${plan.id}/items/${plan.items[0].id}`).send({ status: 'ATLIKTAS' }).expect(404);

    const item = await prisma.planItem.findUniqueOrThrow({ where: { id: plan.items[0].id } });
    expect(item.status).toBe('NOT_DONE');
  });

  it('kito plano punktas per šį planą nekeičiamas – 404', async () => {
    const { agent, user, plan } = await setup();
    const ach = await prisma.achievement.findFirstOrThrow({ where: { appId: 620, apiName: 'ACH_6' } });
    const second = await repo.createPlan(user.id, 620, 'fake', { availableMinutes: 30 }, [
      { achievementId: ach.id, position: 1, estimatedMinutes: 10, justification: 'Item of another plan.' },
    ]);
    await agent.patch(`/api/plans/${plan.id}/items/${second.items[0].id}`).send({ status: 'ATLIKTAS' }).expect(404);
  });

  it('API-09: neteisingi parametrai → 400; neegzistuojantis planas → 404', async () => {
    const { agent, plan } = await setup();
    for (const path of ['/api/plans/abc', '/api/plans/0', '/api/plans/-1', '/api/plans?appId=abc']) {
      expect((await agent.get(path)).status, path).toBe(400);
    }
    const item = `/api/plans/${plan.id}/items/${plan.items[0].id}`;
    for (const body of [{ status: 'DONE' }, { status: 'atliktas' }, {}, { status: 'ATLIKTAS', completedAt: '2020-01-01' }]) {
      expect((await agent.patch(item).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    await agent.get('/api/plans/999999').expect(404);
  });
});