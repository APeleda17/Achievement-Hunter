import { beforeEach, describe, expect, it } from 'vitest';
import { createPlanRepo } from '../src/db/planRepo.ts';
import { createAchievementAttributesRepo } from '../src/db/achievementAttributesRepo.js';
import { createSteamMock, createTestApp, loginAs, prisma, resetDb, STEAM_ID_A } from './helpers.js';

// 3 sprintas, 1 užduotis: duomenų modelis (DB-05, DPK-06)
const plans = createPlanRepo(prisma);
const attributes = createAchievementAttributesRepo(prisma);

async function seed() {
  const userA = await prisma.user.create({ data: { steamId: '76561198000000101', personaName: 'A' } });
  const userB = await prisma.user.create({ data: { steamId: '76561198000000102', personaName: 'B' } });
  await prisma.game.create({ data: { appId: 620, name: 'Portal 2' } });
  const [ach1, ach2] = await Promise.all(
    ['ACH_1', 'ACH_2'].map((apiName) => prisma.achievement.create({ data: { appId: 620, apiName, name: apiName } })),
  );
  return { userA, userB, ach1, ach2 };
}

async function seedPlan() {
  const data = await seed();
  const plan = await plans.createPlan(data.userA.id, 620, 'test-model', { availableMinutes: 60, desiredDifficulty: 'EASY' }, [
    { achievementId: data.ach1.id, position: 1, estimatedMinutes: 20, justification: 'Pirmas' },
    { achievementId: data.ach2.id, position: 2, estimatedMinutes: 30, justification: 'Antras' },
  ]);
  return { ...data, plan };
}

describe('DB-05, DPK-06: rinkimo planai ir pasiekimo atributai', () => {
  beforeEach(resetDb);

  it('planas sukuriamas su kriterijais ir punktais; punktai pradžioje NOT_DONE', async () => {
    const { userA, plan } = await seedPlan();

    const stored = await plans.getPlan(userA.id, plan.id);
    expect(stored?.criteria).toMatchObject({ availableMinutes: 60, desiredDifficulty: 'EASY', achievementType: null });
    expect(stored?.items.map((i) => [i.position, i.status, i.completedAt])).toEqual([
      [1, 'NOT_DONE', null],
      [2, 'NOT_DONE', null],
    ]);

    const list = await plans.listPlans(userA.id);
    expect(list).toHaveLength(1);
    expect(list[0]._count.items).toBe(2);
  });

  it('FR-14: naudotojas B negauna ir negali keisti naudotojo A plano', async () => {
    const { userB, plan } = await seedPlan();

    expect(await plans.getPlan(userB.id, plan.id)).toBeNull();
    expect(await plans.listPlans(userB.id)).toEqual([]);
    expect(await plans.setItemStatus(userB.id, plan.id, plan.items[0].id, 'DONE')).toBe(false);

    const item = await prisma.planItem.findUnique({ where: { id: plan.items[0].id } });
    expect(item?.status).toBe('NOT_DONE');
  });

  it('ištrynus planą kartu ištrinami kriterijai ir punktai (Cascade)', async () => {
    const { plan } = await seedPlan();

    await prisma.collectionPlan.delete({ where: { id: plan.id } });

    expect(await prisma.planCriteria.count()).toBe(0);
    expect(await prisma.planItem.count()).toBe(0);
  });

  it('PLN-05: DONE nustato completedAt, NOT_DONE jį išvalo', async () => {
    const { userA, plan } = await seedPlan();
    const itemId = plan.items[0].id;

    expect(await plans.setItemStatus(userA.id, plan.id, itemId, 'DONE')).toBe(true);
    let item = await prisma.planItem.findUnique({ where: { id: itemId } });
    expect(item?.status).toBe('DONE');
    expect(item?.completedAt).toBeInstanceOf(Date);

    expect(await plans.setItemStatus(userA.id, plan.id, itemId, 'NOT_DONE')).toBe(true);
    item = await prisma.planItem.findUnique({ where: { id: itemId } });
    expect(item?.status).toBe('NOT_DONE');
    expect(item?.completedAt).toBeNull();
  });

  describe('CHECK ribojimai atmeta neleistinas reikšmes', () => {
    it.each([10, 601])('turimas laikas %i min.', async (availableMinutes) => {
      const { userA, ach1 } = await seed();
      await expect(
        plans.createPlan(userA.id, 620, 'm', { availableMinutes }, [
          { achievementId: ach1.id, position: 1, estimatedMinutes: 10, justification: 'x' },
        ]),
      ).rejects.toThrow();
      expect(await prisma.collectionPlan.count()).toBe(0); // transakcija atšaukta
    });

    it('numatoma trukmė 0 min.', async () => {
      const { userA, ach1 } = await seed();
      await expect(
        plans.createPlan(userA.id, 620, 'm', { availableMinutes: 60 }, [
          { achievementId: ach1.id, position: 1, estimatedMinutes: 0, justification: 'x' },
        ]),
      ).rejects.toThrow();
    });

    it('retumas 101 %', async () => {
      await seed();
      await expect(attributes.saveRarity(620, new Map([['ACH_1', 101]]))).rejects.toThrow();
    });

    it('prieinamumas „KITA“', async () => {
      const { ach1 } = await seed();
      await expect(
        prisma.achievement.update({ where: { id: ach1.id }, data: { availability: 'KITA' } }),
      ).rejects.toThrow();
    });
  });

  it('achievementAttributesRepo išsaugo įvertinimą ir retumą', async () => {
    const { ach1 } = await seed();

    await attributes.saveAssessment(ach1.id, {
      availability: 'NEPRIEINAMAS', difficulty: 'HARD', achievementType: 'kolekcija', reason: 'Išimtas', model: 'm',
    });
    await attributes.saveRarity(620, new Map([['ACH_1', 12.5]]));

    const stored = await prisma.achievement.findUnique({ where: { id: ach1.id } });
    expect(stored).toMatchObject({
      availability: 'NEPRIEINAMAS', difficulty: 'HARD', achievementType: 'kolekcija',
      availabilityReason: 'Išimtas', assessmentModel: 'm', rarityPercent: 12.5,
    });
    expect(stored?.assessedAt).toBeInstanceOf(Date);
    expect(stored?.rarityUpdatedAt).toBeInstanceOf(Date);
  });

  it('Steam sinchronizacija nenulina sunkumo, prieinamumo ir retumo', async () => {
    const { agent } = await loginAs(createTestApp(createSteamMock()), STEAM_ID_A);
    await agent.get('/api/games').expect(200);
    await agent.post('/api/sync').expect(200);

    const ach = await prisma.achievement.findUniqueOrThrow({ where: { appId_apiName: { appId: 620, apiName: 'ACH_1' } } });
    await attributes.saveAssessment(ach.id, {
      availability: 'PRIEINAMAS', difficulty: 'MEDIUM', achievementType: 'istorija', reason: 'Galima gauti', model: 'm',
    });
    await attributes.saveRarity(620, new Map([['ACH_1', 42]]));

    await agent.post('/api/sync').expect(200);

    const after = await prisma.achievement.findUniqueOrThrow({ where: { id: ach.id } });
    expect(after).toMatchObject({ availability: 'PRIEINAMAS', difficulty: 'MEDIUM', achievementType: 'istorija', rarityPercent: 42 });
  });
});