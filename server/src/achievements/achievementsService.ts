import type { PrismaClient } from '@prisma/client';
import { calcProgress } from './progress.js';
import type { SyncService } from '../sync/syncService.js';
import { AppError } from '../errors.js';
import type { RarityService } from './rarityService.js';
import { DEFAULT_QUERY, DIFFICULTY_ORDER, hasFilters, type AchievementQuery } from './achievementQuery.js';

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
  rarityPercent: number | null;
  /** PRIEINAMAS | NEPRIEINAMAS | NEZINOMA; null – dar neįvertinta (NI-9) */
  availability: string | null;
  availabilityReason: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'VERY_HARD' | null;
  achievementType: string | null;
  
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
  filtered: boolean;
}

function compareNullable(a: number | null, b: number | null, direction: 1 | -1) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function sortAchievements(list: AchievementDto[], query: AchievementQuery): AchievementDto[] {
  if (query.sort === 'default') return query.order === 'desc' ? [...list].reverse() : list;
  const direction = query.order === 'desc' ? -1 : 1;
  const byName = (a: AchievementDto, b: AchievementDto) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  return [...list].sort((a, b) => {
    const primary =
      query.sort === 'name' ? byName(a, b) * direction
      : query.sort === 'rarity' ? compareNullable(a.rarityPercent, b.rarityPercent, direction)
      : compareNullable(a.difficulty && DIFFICULTY_ORDER[a.difficulty], b.difficulty && DIFFICULTY_ORDER[b.difficulty], direction);
    return primary || byName(a, b);
  });
}

export function createAchievementsService(prisma: PrismaClient, sync: SyncService, rarity?: RarityService) {
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

    async function buildDto(userId: number, appId: number, query: AchievementQuery): Promise<GameAchievementsDto> {
    const userGame = await findOwnedGame(userId, appId);
    // PAS-05: retumas atnaujinamas, jei jo nėra arba jis senesnis nei 24 h; Steam klaida sąrašo nesugadina
    if (rarity && (userGame.totalCount ?? 0) > 0) await rarity.ensureFresh(appId);
    // PAS-04: filtrai taikomi DB užklausoje
    const rows = await prisma.userAchievement.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status === 'unlocked' ? ('ATRAKINTAS' as const) : ('NEATRAKINTAS' as const) } : {}),
        achievement: {
          appId,
          ...(query.availability ? { availability: query.availability } : {}),
          ...(query.difficulty ? { difficulty: query.difficulty } : {}),
          ...(query.type ? { achievementType: query.type } : {}),
        },
      },
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
      achievements: sortAchievements(rows.map((r) => ({
                apiName: r.achievement.apiName,
        name: r.achievement.name,
        description: r.achievement.description,
        iconUrl: r.achievement.iconUrl,
        unlocked: r.status === 'ATRAKINTAS',
        unlockedAt: r.unlockedAt?.toISOString() ?? null,
        rarityPercent: r.achievement.rarityPercent,
        availability: r.achievement.availability,
        availabilityReason: r.achievement.availabilityReason,
        difficulty: r.achievement.difficulty,
        achievementType: r.achievement.achievementType,
      })), query),
      filtered: hasFilters(query),
    };
  }

  return {
    /** FR-07: pasiekimų sąrašas. Pirmą kartą atidarius žaidimą – parsiunčiama iš Steam. */
    async getAchievements(userId: number, appId: number, query: AchievementQuery = DEFAULT_QUERY): Promise<GameAchievementsDto> {
      const userGame = await findOwnedGame(userId, appId);
      if (!userGame.lastSyncedAt) {
        await syncGameOrFail(userId, appId, false);
      }
return buildDto(userId, appId, query);
    },

    /** FR-10: „Atnaujinti“ žaidimo ekrane. */
    async refreshAchievements(userId: number, appId: number): Promise<GameAchievementsDto> {
      const userGame = await findOwnedGame(userId, appId);
      await syncGameOrFail(userId, appId, userGame.lastSyncedAt !== null);
      return buildDto(userId, appId, DEFAULT_QUERY);
    },
  };
}

export type AchievementsService = ReturnType<typeof createAchievementsService>;
