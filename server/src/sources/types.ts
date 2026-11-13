import { createHash } from 'node:crypto';

export const SOURCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export interface SourceQuery {
  achievementId: number;
  appId: number;
  gameName: string;
  name: string;
  description: string;
  achievementNames?: string[];
}
export interface SourceCandidate {
  url: string;
  title: string;
  type: 'WIKI' | 'STEAM_GUIDE';
  excerpt: string;
  fetchedAt?: Date;
}
export interface GuideEvidence extends SourceCandidate {
  id: number;
  fetchedAt: Date;
}
export interface SourcesCollector {
  collect(query: SourceQuery, signal: AbortSignal): Promise<GuideEvidence[]>;
}
export const sourceQueryHash = (query: SourceQuery) => createHash('sha256')
  .update(JSON.stringify(['sources-v6', query.appId, query.gameName, query.name, query.description])).digest('hex');
