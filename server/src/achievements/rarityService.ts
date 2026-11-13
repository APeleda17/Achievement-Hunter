import type { PrismaClient } from '@prisma/client';
import { SteamUnavailableError, type SteamClient } from '../steam/steamClient.js';
import { createAchievementAttributesRepo } from '../db/achievementAttributesRepo.js';

// SDG-05, PAS-05: pasiekimų retumas iš Steam.
// Retumas bendras visiems naudotojams, todėl Steam kviečiamas tik tada, kai duomenų nėra
// arba jie senesni nei 24 h. Steam sutrikus paliekami seni duomenys (FR-12 principas).

export const RARITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RarityRefresh = 'FRESH' | 'UPDATED' | 'STEAM_UNAVAILABLE';

export function createRarityService(prisma: PrismaClient, steam: SteamClient, now: () => Date = () => new Date()) {
  const attributes = createAchievementAttributesRepo(prisma);

  return {
    /**
     * Užtikrina, kad žaidimo pasiekimų retumas būtų ne senesnis nei 24 h.
     * FRESH – Steam nekviestas; UPDATED – atnaujinta; STEAM_UNAVAILABLE – liko seni duomenys.
     */
    async ensureFresh(appId: number): Promise<RarityRefresh> {
      const staleBefore = new Date(now().getTime() - RARITY_MAX_AGE_MS);
      const stale = await prisma.achievement.count({
        where: { appId, OR: [{ rarityUpdatedAt: null }, { rarityUpdatedAt: { lt: staleBefore } }] },
      });
      if (stale === 0) return 'FRESH';

      try {
        const percents = await steam.getGlobalAchievementPercentages(appId);
        await attributes.saveRarity(appId, percents);
        // Pasiekimai, kurių Steam negrąžino, pažymimi patikrintais, kad Steam nebūtų kviečiamas kas kartą
        await prisma.achievement.updateMany({
          where: { appId, apiName: { notIn: [...percents.keys()] } },
          data: { rarityUpdatedAt: now() },
        });
        return 'UPDATED';
      } catch (err) {
        if (err instanceof SteamUnavailableError) {
          console.warn(`[rarity] žaidimas ${appId}: Steam nepasiekiamas, paliekami seni duomenys`);
          return 'STEAM_UNAVAILABLE';
        }
        throw err;
      }
    },
  };
}
export type RarityService = ReturnType<typeof createRarityService>;