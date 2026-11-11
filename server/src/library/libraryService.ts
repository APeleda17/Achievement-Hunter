import type { PrismaClient } from '@prisma/client';
import { calcProgress } from '../achievements/progress.js';
import { listUserGames } from '../db/libraryRepo.js';
import { findUserById } from '../db/userRepo.js';
import type { SyncService } from '../sync/syncService.js';
import { AppError } from '../errors.js';

// BIB – žaidimų bibliotekos komponentas (NI-6).

export interface LibraryGameDto {
  appId: number;
  name: string;
  iconUrl: string | null;
  playtimeMinutes: number;
  /** null – pasiekimai dar nesinchronizuoti; false – žaidimas neturi pasiekimų */
  hasAchievements: boolean | null;
  unlockedCount: number | null;
  totalCount: number | null;
  /** 0–100, 1 skaitmuo po kablelio; null – nežinomas arba pasiekimų nėra */
  progressPercent: number | null;
  lastSyncedAt: string | null;
}

export interface LibraryDto {
  games: LibraryGameDto[];
  /** Paskutinio sėkmingo bibliotekos atnaujinimo laikas, ISO 8601 UTC (FR-11) */
  lastSyncedAt: string | null;
}

export function createLibraryService(prisma: PrismaClient, sync: SyncService) {
  return {
    async getLibrary(userId: number, search?: string): Promise<LibraryDto> {
      let user = await findUserById(prisma, userId);
      if (!user) throw new AppError(401, 'UNAUTHORIZED');

      // BIB-01: pirmą kartą – parsiunčiame žaidimų sąrašą (be pasiekimų).
      // Jei nepavyks, klaida (503 / 403) grįš klientui – ne tuščias sąrašas (FR-13).
      if (!user.lastLibrarySyncAt) {
        await sync.syncLibrary(userId, { withAchievements: false });
        user = (await findUserById(prisma, userId))!;
      }

      const rows = await listUserGames(prisma, userId, search);
      return {
        lastSyncedAt: user.lastLibrarySyncAt?.toISOString() ?? null,
        games: rows.map((ug) => {
          const synced = ug.totalCount !== null && ug.unlockedCount !== null;
          const progress = synced ? calcProgress(ug.unlockedCount!, ug.totalCount!) : null;
          return {
            appId: ug.appId,
            name: ug.game.name,
            iconUrl: ug.game.iconUrl,
            playtimeMinutes: ug.playtimeMinutes,
            hasAchievements: progress ? progress.hasAchievements : null,
            unlockedCount: ug.unlockedCount,
            totalCount: ug.totalCount,
            progressPercent: progress?.hasAchievements ? progress.percent : null,
            lastSyncedAt: ug.lastSyncedAt?.toISOString() ?? null,
          };
        }),
      };
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
