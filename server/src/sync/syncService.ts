import pLimit from 'p-limit';
import type { PrismaClient } from '@prisma/client';
import {
  SteamPrivateProfileError,
  SteamUnavailableError,
  type SteamClient,
} from '../steam/steamClient.js';
import {
  countUserGames,
  saveGameAchievements,
  saveOwnedGames,
  syncedAppIds,
  type GameAchievementData,
} from '../db/libraryRepo.js';
import { AppError } from '../errors.js';

// ATN – duomenų atnaujinimo komponentas (NI-8).
// Principas „viskas arba nieko“: pirma VISKAS parsiunčiama iš Steam (be rašymo į DB),
// tik tada įrašoma vienoje transakcijoje. Jei Steam sutrinka – DB lieka nepaliesta (FR-12, ATN-02..04).

const STEAM_CONCURRENCY = 4; // max lygiagrečių Steam užklausų
const TX_TIMEOUT_MS = 120_000; // didelei bibliotekai transakcija gali užtrukti

export interface SyncService {
  /**
   * Bibliotekos atnaujinimas.
   * withAchievements=false – tik žaidimų sąrašas (pirmas įkėlimas);
   * withAchievements=true – ir pasiekimai žaistiems / jau atidarytiems žaidimams („Atnaujinti“).
   */
  syncLibrary(userId: number, opts: { withAchievements: boolean }): Promise<void>;
  /** Vieno žaidimo pasiekimų atnaujinimas. */
  syncGame(userId: number, appId: number): Promise<void>;
}

export function createSyncService(prisma: PrismaClient, steam: SteamClient): SyncService {
  // Naudotojai, kurių atnaujinimas vyksta dabar (API-06). Vienam serverio procesui to pakanka.
  const running = new Set<number>();

  /** Parsiunčia vieno žaidimo pasiekimų aprašus ir naudotojo būsenas (be rašymo į DB). */
  async function fetchGame(steamId: string, appId: number): Promise<GameAchievementData> {
    const schema = await steam.getSchemaForGame(appId);
    if (schema.length === 0) {
      return { appId, schema: [], player: new Map() };
    }
    const player = await steam.getPlayerAchievements(steamId, appId);
    if (player === null) {
      // „Requested app has no stats“ – laikome, kad pasiekimų nėra (FR-09)
      return { appId, schema: [], player: new Map() };
    }
    return { appId, schema, player: new Map(player.map((p) => [p.apiName, p])) };
  }

  /** Bendras apvalkalas: užraktas, klaidų vertimas į API kodus, žurnalas (ATN-05). */
  async function run(userId: number, label: string, work: () => Promise<void>) {
    if (running.has(userId)) {
      throw new AppError(409, 'SYNC_IN_PROGRESS');
    }
    running.add(userId);
    const started = Date.now();
    try {
      await work();
      console.info(`[sync] ${label} naudotojas id=${userId}: sėkmė, ${Date.now() - started} ms`);
    } catch (err) {
      const ms = Date.now() - started;
      if (err instanceof SteamPrivateProfileError) {
        console.warn(`[sync] ${label} naudotojas id=${userId}: privatus profilis, ${ms} ms`);
        throw new AppError(403, 'PROFILE_PRIVATE');
      }
      if (err instanceof SteamUnavailableError) {
        console.warn(`[sync] ${label} naudotojas id=${userId}: Steam nepasiekiamas (${err.message}), ${ms} ms`);
        // Klientas pagal šį požymį rodo išsaugotus duomenis (FR-12) arba klaidos būseną (FR-13)
        const hasCachedData = (await countUserGames(prisma, userId)) > 0;
        throw new AppError(503, 'STEAM_UNAVAILABLE', undefined, { hasCachedData });
      }
      throw err;
    } finally {
      running.delete(userId);
    }
  }

  async function getUser(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED');
    return user;
  }

  return {
    syncLibrary(userId, { withAchievements }) {
      return run(userId, withAchievements ? 'biblioteka+pasiekimai' : 'biblioteka', async () => {
        const user = await getUser(userId);

        // 1. Parsiunčiame iš Steam
        const owned = await steam.getOwnedGames(user.steamId);
        if (owned === null) throw new SteamPrivateProfileError();

        let gamesData: GameAchievementData[] = [];
        if (withAchievements) {
          const opened = await syncedAppIds(prisma, userId);
          const targets = owned.filter((g) => g.playtimeMinutes > 0 || opened.has(g.appId));
          const limit = pLimit(STEAM_CONCURRENCY);
          gamesData = await Promise.all(targets.map((g) => limit(() => fetchGame(user.steamId, g.appId))));
        }

        // 2. Įrašome viską vienoje transakcijoje
        const now = new Date();
        await prisma.$transaction(
          async (tx) => {
            await saveOwnedGames(tx, userId, owned);
            for (const data of gamesData) {
              await saveGameAchievements(tx, userId, data, now);
            }
            // Laikas atnaujinamas tik kartu su sėkmingai įrašytais duomenimis (ATN-03)
            await tx.user.update({ where: { id: userId }, data: { lastLibrarySyncAt: now } });
          },
          { timeout: TX_TIMEOUT_MS },
        );
      });
    },

    syncGame(userId, appId) {
      return run(userId, `žaidimas ${appId}`, async () => {
        const user = await getUser(userId);
        const data = await fetchGame(user.steamId, appId);
        await prisma.$transaction(
          (tx) => saveGameAchievements(tx, userId, data, new Date()),
          { timeout: TX_TIMEOUT_MS },
        );
      });
    },
  };
}
