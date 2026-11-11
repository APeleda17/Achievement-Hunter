import type { Prisma, PrismaClient } from '@prisma/client';
import type { OwnedGame, SchemaAchievement, PlayerAchievement } from '../steam/steamClient.js';

// DPK – bibliotekos ir pasiekimų duomenų prieiga.
// Visos naudotojo užklausos ribojamos userId (DPK-03).

type Tx = Prisma.TransactionClient;

/** Naudotojo žaidimai, pasirinktinai filtruojant pagal pavadinimo dalį (FR-06). */
export function listUserGames(prisma: PrismaClient, userId: number, search?: string) {
  return prisma.userGame.findMany({
    where: {
      userId,
      // Tuščia paieška – visi žaidimai; kitaip ILIKE '%search%' (be raidžių dydžio)
      ...(search ? { game: { name: { contains: search, mode: 'insensitive' } } } : {}),
    },
    include: { game: true },
    orderBy: { game: { name: 'asc' } },
  });
}

export function countUserGames(prisma: PrismaClient, userId: number) {
  return prisma.userGame.count({ where: { userId } });
}

/** Žaidimai, kurių pasiekimai jau bent kartą sinchronizuoti („atidaryti“). */
export async function syncedAppIds(prisma: PrismaClient, userId: number): Promise<Set<number>> {
  const rows = await prisma.userGame.findMany({
    where: { userId, lastSyncedAt: { not: null } },
    select: { appId: true },
  });
  return new Set(rows.map((r) => r.appId));
}

/** Įrašo bibliotekos sąrašą: žaidimai, žaidimo laikas; pašalina nebeturimus žaidimus. */
export async function saveOwnedGames(tx: Tx, userId: number, games: OwnedGame[]) {
  for (const g of games) {
    await tx.game.upsert({
      where: { appId: g.appId },
      create: { appId: g.appId, name: g.name, iconUrl: g.iconUrl },
      update: { name: g.name, iconUrl: g.iconUrl },
    });
    await tx.userGame.upsert({
      where: { userId_appId: { userId, appId: g.appId } },
      create: { userId, appId: g.appId, playtimeMinutes: g.playtimeMinutes },
      update: { playtimeMinutes: g.playtimeMinutes },
    });
  }
  await tx.userGame.deleteMany({
    where: { userId, appId: { notIn: games.map((g) => g.appId) } },
  });
}

/** Vieno žaidimo pasiekimų duomenys, gauti iš Steam ir sujungti. */
export interface GameAchievementData {
  appId: number;
  schema: SchemaAchievement[];
  /** apiName → naudotojo būsena */
  player: Map<string, PlayerAchievement>;
}

/** Įrašo vieno žaidimo pasiekimus ir naudotojo būsenas, atnaujina progresą ir laiką (FR-10, FR-11). */
export async function saveGameAchievements(tx: Tx, userId: number, data: GameAchievementData, syncedAt: Date) {
  const { appId, schema, player } = data;
  const hasAchievements = schema.length > 0;

  await tx.game.update({ where: { appId }, data: { hasAchievements } });

  for (const a of schema) {
    await tx.achievement.upsert({
      where: { appId_apiName: { appId, apiName: a.apiName } },
      create: { appId, apiName: a.apiName, name: a.name, description: a.description, iconUrl: a.iconUrl },
      update: { name: a.name, description: a.description, iconUrl: a.iconUrl },
    });
  }

  const stored = await tx.achievement.findMany({
    where: { appId, apiName: { in: schema.map((a) => a.apiName) } },
    select: { id: true, apiName: true },
  });

  // Naudotojo būsenas perrašome iš naujo – paprasčiau nei lyginti po vieną
  await tx.userAchievement.deleteMany({ where: { userId, achievement: { appId } } });
  await tx.userAchievement.createMany({
    data: stored.map((a) => {
      const p = player.get(a.apiName);
      return {
        userId,
        achievementId: a.id,
        status: p?.achieved ? ('ATRAKINTAS' as const) : ('NEATRAKINTAS' as const),
        unlockedAt: p?.achieved ? p.unlockedAt : null,
      };
    }),
  });

  const unlocked = schema.filter((a) => player.get(a.apiName)?.achieved).length;
  await tx.userGame.update({
    where: { userId_appId: { userId, appId } },
    data: { unlockedCount: unlocked, totalCount: schema.length, lastSyncedAt: syncedAt },
  });
}
