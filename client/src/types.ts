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
}

export interface GameAchievements {
  appId: number;
  name: string;
  hasAchievements: boolean;
  progress: { unlocked: number; total: number; percent: number } | null;
  lastSyncedAt: string | null;
  achievements: Achievement[];
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
