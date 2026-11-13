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
export interface HelpInput extends GuideInput { problem: string }
export interface HelpCause { reason: string; sourceIds: number[] }
export interface HelpAiClient {
  help(input: HelpInput, signal: AbortSignal): Promise<{ causes: HelpCause[]; steps: GuideStep[]; model: string }>;
}
export interface HelpDto extends GuideDto { problem: string; causes: HelpCause[] }
export type AiResultDto = ExplanationDto | GuideDto | HelpDto;
