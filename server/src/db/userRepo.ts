import type { PrismaClient } from '@prisma/client';

// DPK – naudotojų duomenų prieiga.

export function findUserById(prisma: PrismaClient, userId: number) {
  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Randa naudotoją pagal SteamID arba sukuria naują (FR-02, AUT-03).
 * Profilio duomenys atnaujinami tik jei juos pavyko gauti iš Steam.
 */
export function upsertUserBySteamId(
  prisma: PrismaClient,
  steamId: string,
  profile: { personaName: string; avatarUrl: string | null; profilePublic: boolean } | null,
) {
  return prisma.user.upsert({
    where: { steamId },
    create: {
      steamId,
      personaName: profile?.personaName ?? steamId,
      avatarUrl: profile?.avatarUrl ?? null,
      profilePublic: profile?.profilePublic ?? true,
    },
    update: profile ?? {},
  });
}
