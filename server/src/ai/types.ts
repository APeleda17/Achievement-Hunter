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
export type AiResultDto = ExplanationDto | GuideDto;
