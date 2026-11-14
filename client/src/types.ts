// Serverio atsakymų tipai (atitinka server/src/**/…Dto).

export interface Me {
  steamId: string;
  personaName: string;
  avatarUrl: string | null;
  profilePrivate: boolean;
  lastLibrarySyncAt: string | null;
}

export interface LibraryGame {
  appId: number;
  name: string;
  iconUrl: string | null;
  playtimeMinutes: number;
  /** null – dar nesinchronizuota; false – žaidimas neturi pasiekimų */
  hasAchievements: boolean | null;
  unlockedCount: number | null;
  totalCount: number | null;
  progressPercent: number | null;
  lastSyncedAt: string | null;
}

export interface Library {
  games: LibraryGame[];
  lastSyncedAt: string | null;
}

export interface Achievement {
  apiName: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
    unlocked: boolean;
  unlockedAt: string | null;
  /** 3 sprintas: visų žaidėjų atrakinimo procentas (NI-11) */
  rarityPercent: number | null;
  /** null – dar neįvertinta (NI-9) */
  availability: Availability | null;
  availabilityReason: string | null;
  difficulty: Difficulty | null;
  achievementType: string | null;
}

export interface GameAchievements {
  appId: number;
  name: string;
  hasAchievements: boolean;
  progress: { unlocked: number; total: number; percent: number } | null;
  lastSyncedAt: string | null;
  achievements: Achievement[];
  filtered: boolean;
}

export type Availability = 'PRIEINAMAS' | 'NEPRIEINAMAS' | 'NEZINOMA';
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const ACHIEVEMENT_TYPES = ['STORY', 'COLLECTION', 'COMBAT', 'CHALLENGE', 'EXPLORATION', 'MULTIPLAYER', 'PROGRESSION', 'OTHER'] as const;
export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

export interface AchievementQuery {
  status?: 'unlocked' | 'locked';
  availability?: Availability;
  difficulty?: Difficulty;
  type?: AchievementType;
  sort?: 'default' | 'name' | 'rarity' | 'difficulty';
  order?: 'asc' | 'desc';
}

export interface AvailabilityAssessment {
  availability: Availability;
  difficulty: Difficulty | null;
  achievementType: string | null;
  reason: string;
  assessedAt: string;
  model: string;
  generatedByAi: true;
}
export type AvailabilityResponse = AvailabilityAssessment | { jobId: string; status: 'LAUKIA' | 'VYKDOMA' };

export interface PlanCriteria {
  availableMinutes: number;
  desiredDifficulty: Difficulty | null;
  achievementType: AchievementType | null;
}
export interface PlanProgress { done: number; total: number; percent: number }
export interface PlanItem {
  id: number;
  position: number;
  apiName: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  estimatedMinutes: number;
  justification: string;
  status: 'NEATLIKTAS' | 'ATLIKTAS';
  completedAt: string | null;
}
export interface Plan {
  id: number;
  appId: number;
  gameName: string;
  createdAt: string;
  model: string;
  generatedByAi: true;
  criteria: PlanCriteria;
  totalMinutes: number;
  progress: PlanProgress;
  items: PlanItem[];
}
export interface PlanSummary {
  id: number;
  appId: number;
  gameName: string;
  createdAt: string;
  totalMinutes: number;
  progress: PlanProgress;
}
export interface PlanRequest {
  appId: number;
  availableMinutes: number;
  difficulty?: Difficulty;
  type?: AchievementType;
}

export interface Explanation {
  text: string;
  generatedAt: string;
  model: string;
  generatedByAi: true;
}

export type ExplainResponse = Explanation | { jobId: string; status: 'LAUKIA' | 'VYKDOMA' };
export type AiJob<T = Explanation> =
  | { id: string; status: 'LAUKIA' | 'VYKDOMA' }
  | { id: string; status: 'BAIGTA'; result: T }
  | { id: string; status: 'KLAIDA'; error: { code: string } };

export interface Guide {
  id: number;
  steps: { instruction: string; sourceIds: number[] }[];
  generatedAt: string;
  model: string;
  generatedByAi: true;
  sources: { id: number; title: string; url: string; type: 'WIKI' | 'STEAM_GUIDE'; fetchedAt: string }[];
}
export type GuideResponse = Guide | { jobId: string; status: 'LAUKIA' | 'VYKDOMA' };
export interface HelpAnswer extends Guide {
  problem: string;
  causes: { reason: string; sourceIds: number[] }[];
}
export type HelpResponse = HelpAnswer | { jobId: string; status: 'LAUKIA' | 'VYKDOMA' };
