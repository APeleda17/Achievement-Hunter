import type { GuideEvidence } from '../sources/types.js';

export interface ExplainInput {
  gameName: string;
  name: string;
  description: string;
}

export interface ExplanationDto {
  text: string;
  generatedAt: string;
  model: string;
  generatedByAi: true;
}

export interface AiClient {
  explain(input: ExplainInput, signal: AbortSignal): Promise<{ text: string; model: string }>;
  guide?: GuideAiClient['guide'];
  help?: HelpAiClient['help'];
  assess?: AssessmentAiClient['assess'];
  plan?: PlanAiClient['plan'];
}

export interface GuideStep { instruction: string; sourceIds: number[] }
export interface GuideInput extends ExplainInput { sources: GuideEvidence[] }
export interface GuideAiClient {
  guide(input: GuideInput, signal: AbortSignal): Promise<{ steps: GuideStep[]; model: string }>;
}
export interface GuideDto {
  id: number;
  steps: GuideStep[];
  generatedAt: string;
  model: string;
  generatedByAi: true;
  sources: { id: number; title: string; url: string; type: string; fetchedAt: string }[];
}
export interface GuideSourcesDto extends Pick<GuideDto, 'generatedAt' | 'generatedByAi' | 'sources'> {
  guideId: number;
}
export interface HelpInput extends GuideInput { problem: string }
export interface HelpCause { reason: string; sourceIds: number[] }
export interface HelpAiClient {
  help(input: HelpInput, signal: AbortSignal): Promise<{ causes: HelpCause[]; steps: GuideStep[]; model: string }>;
}
export interface HelpDto extends GuideDto { problem: string; causes: HelpCause[] }

// NI-9: prieinamumo ir sunkumo įvertinimas (PRI-01..03, DIS-06)
export const AVAILABILITY_VALUES = ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'] as const;
export const DIFFICULTY_VALUES = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] as const;
// Fiksuotas tipų sąrašas, kad pagal tipą būtų galima filtruoti (NI-10)
export const ACHIEVEMENT_TYPE_VALUES = ['STORY', 'COLLECTION', 'COMBAT', 'CHALLENGE', 'EXPLORATION', 'MULTIPLAYER', 'PROGRESSION', 'OTHER'] as const;
export type AiAvailability = (typeof AVAILABILITY_VALUES)[number];
export type AiDifficulty = (typeof DIFFICULTY_VALUES)[number];
export type AchievementTypeValue = (typeof ACHIEVEMENT_TYPE_VALUES)[number];

export interface AssessmentInput extends ExplainInput { sources: GuideEvidence[] }
export interface Assessment {
  availability: AiAvailability;
  difficulty: AiDifficulty;
  achievementType: AchievementTypeValue;
  reason: string;
  sourceIds: number[];
}
export interface AssessmentAiClient {
  assess(input: AssessmentInput, signal: AbortSignal): Promise<Assessment & { model: string }>;
}
export interface AvailabilityDto {
  /** DB reikšmė: PRIEINAMAS | NEPRIEINAMAS | NEZINOMA */
  availability: 'PRIEINAMAS' | 'NEPRIEINAMAS' | 'NEZINOMA';
  difficulty: AiDifficulty | null;
  achievementType: string | null;
  reason: string;
  assessedAt: string;
  model: string;
  generatedByAi: true;
}

export interface PlanCandidate {
  candidateId: number;
  achievementId: number;
  apiName: string;
  name: string;
  description: string;
  difficulty: AiDifficulty | null;
  achievementType: string | null;
  rarityPercent: number | null;
}
export interface PlanCriteriaDto {
  availableMinutes: number;
  desiredDifficulty: AiDifficulty | null;
  achievementType: AchievementTypeValue | null;
}
export interface PlanInput {
  gameName: string;
  criteria: PlanCriteriaDto;
  candidates: PlanCandidate[];
}
export interface PlanDraftItem { candidateId: number; estimatedMinutes: number; justification: string }
export interface PlanAiClient {
  plan(input: PlanInput, signal: AbortSignal): Promise<{ items: PlanDraftItem[]; model: string }>;
}
export interface PlanItemDto {
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
export interface PlanDto {
  id: number;
  appId: number;
  gameName: string;
  createdAt: string;
  model: string;
  generatedByAi: true;
  criteria: PlanCriteriaDto;
  totalMinutes: number;
  items: PlanItemDto[];
}
export type AiResultDto = ExplanationDto | GuideDto | HelpDto | AvailabilityDto | PlanDto;
