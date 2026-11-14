import { z } from 'zod';
import { ACHIEVEMENT_TYPE_VALUES, DIFFICULTY_VALUES } from '../ai/types.js';

// API-10, PAS-04: pasiekimų filtrų ir rūšiavimo parametrai (NI-10, NI-11, U12, U13).
// Nežinomi parametrai ignoruojami, o žinomų parametrų neleistinos reikšmės – 400.

export const DIFFICULTY_ORDER: Record<(typeof DIFFICULTY_VALUES)[number], number> = { EASY: 1, MEDIUM: 2, HARD: 3, VERY_HARD: 4 };

export const achievementQuerySchema = z.object({
  /** Būsena: atrakinti / neatrakinti */
  status: z.enum(['unlocked', 'locked']).optional(),
  /** Prieinamumas (NI-9 įvertinimas) */
  availability: z.enum(['PRIEINAMAS', 'NEPRIEINAMAS', 'NEZINOMA']).optional(),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  type: z.enum(ACHIEVEMENT_TYPE_VALUES).optional(),
  /** default – Steam tvarka; rarity – pagal retumo procentą (asc: rečiausi pirmi) */
  sort: z.enum(['default', 'name', 'rarity', 'difficulty']).default('default'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type AchievementQuery = z.infer<typeof achievementQuerySchema>;

export const DEFAULT_QUERY: AchievementQuery = { sort: 'default', order: 'asc' };

export const hasFilters = (query: AchievementQuery) =>
  query.status !== undefined || query.availability !== undefined || query.difficulty !== undefined || query.type !== undefined;