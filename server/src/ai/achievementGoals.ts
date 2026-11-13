import { AppError } from '../errors.js';
import { normalized } from '../sources/extract.js';
import type { ExplainInput } from './types.js';

export function missionGoalFor(input: ExplainInput) {
  const match = /^Complete\s+(.+?)\s+on\s+(.+?)[.!]?$/i.exec(input.description.trim());
  return normalized(input.gameName).includes('call of duty') && match
    && !/campaign|entire game|whole game|all missions|every mission/i.test(match[1])
    && /hardened|veteran|realistic/i.test(match[2])
    ? { name: match[1], difficulties: match[2] } : undefined;
}
export function validateMissionGoal(text: string, goal: ReturnType<typeof missionGoalFor>) {
  if (!goal) return;
  const value = normalized(text);
  if (!value.includes(normalized(goal.name)) || !/\bmission\b/.test(value) || /\b(?:entire|whole|full) campaign\b/.test(value)) throw new AppError(502, 'AI_INVALID_RESPONSE');
}
