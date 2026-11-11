import type { PrismaClient } from '@prisma/client';
import { calcProgress } from './progress.js';
import type { SyncService } from '../sync/syncService.js';
import { AppError } from '../errors.js';

// PAS – pasiekimų ir progreso komponentas (NI-7).

export interface AchievementDto {
  apiName: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  /** true – „Atrakintas“, false – „Neatrakintas“ (API-04) */
  unlocked: boolean;
  /** ISO 8601 UTC arba null */
  unlockedAt: string | null;
}

export interface GameAchievementsDto {
  appId: number;
  name: string;
  /** false – „Šis žaidimas neturi pasiekimų“ (FR-09) */
  hasAchievements: boolean;
  /** null, kai pasiekimų nėra – 0 % nerodomas (FR-09) */
  progress: { unlocked: number; total: number; percent: number } | null;
  /** Paskutinio sėkmingo šio žaidimo atnaujinimo laikas, ISO 8601 UTC (FR-11) */
  lastSyncedAt: string | null;
  achievements: AchievementDto[];
}

export function createAchievementsService(prisma: PrismaClient, sync: SyncService) {
  /**
   * PAS-03, FR-14: žaidimas turi priklausyti prisijungusiam naudotojui.
   * Svetimo ar neegzistuojančio žaidimo atveju – 404 (neatskleidžiame, ar jis kažkam priklauso).
   */
  async function findOwnedGame(userId: number, appId: number) {
    const userGame = await prisma.userGame.findUnique({
      where: { userId_appId: { userId, appId } },
      include: { game: true },
    });
    if (!userGame) throw new AppError(404, 'NOT_FOUND');
    return userGame;
  }

  /** Steam klaidą papildome teisingu požymiu: ar šio žaidimo pasiekimai jau buvo išsaugoti. */
  async function syncGameOrFail(userId: number, appId: number, hasCachedData: boolean) {
    try {
      await sync.syncGame(userId, appId);
    } catch (err) {
      if (err instanceof AppError && err.code === 'STEAM_UNAVAILABLE') {
        throw new AppError(503, 'STEAM_UNAVAILABLE', undefined, { hasCachedData });
      }
      throw err;
    }
  }

  async function buildDto(userId: number, appId: number): Promise<GameAchievementsDto> {
    const userGame = await findOwnedGame(userId, appId);
    const rows = await prisma.userAchievement.findMany({
      where: { userId, achievement: { appId } },
      include: { achievement: true },
      orderBy: { achievement: { id: 'asc' } }, // ta pati tvarka kaip Steam
    });

    const progress = calcProgress(userGame.unlockedCount ?? 0, userGame.totalCount ?? 0);
    return {
      appId,
      name: userGame.game.name,
      hasAchievements: progress.hasAchievements,
      progress: progress.hasAchievements
        ? { unlocked: progress.unlocked, total: progress.total, percent: progress.percent }
        : null,
      lastSyncedAt: userGame.lastSyncedAt?.toISOString() ?? null,
      achievements: rows.map((r) => ({
        apiName: r.achievement.apiName,
        name: r.achievement.name,
        description: r.achievement.description,
        iconUrl: r.achievement.iconUrl,
        unlocked: r.status === 'ATRAKINTAS',
        unlockedAt: r.unlockedAt?.toISOString() ?? null,
      })),
    };
  }

  return {
    /** FR-07: pasiekimų sąrašas. Pirmą kartą atidarius žaidimą – parsiunčiama iš Steam. */
    async getAchievements(userId: number, appId: number): Promise<GameAchievementsDto> {
      const userGame = await findOwnedGame(userId, appId);
      if (!userGame.lastSyncedAt) {
        await syncGameOrFail(userId, appId, false);
      }
      return buildDto(userId, appId);
    },

    /** FR-10: „Atnaujinti“ žaidimo ekrane. */
    async refreshAchievements(userId: number, appId: number): Promise<GameAchievementsDto> {
      const userGame = await findOwnedGame(userId, appId);
      await syncGameOrFail(userId, appId, userGame.lastSyncedAt !== null);
      return buildDto(userId, appId);
    },
  };
}

export type AchievementsService = ReturnType<typeof createAchievementsService>;
