import { z } from 'zod';
import { AppError } from '../errors.js';
import { normalized } from '../sources/extract.js';
import type { GuideEvidence } from '../sources/types.js';
import type { GuideStep } from './types.js';

export const guideStepsSchema = z.array(z.object({
  instruction: z.string().trim().min(10).max(600),
  sourceIds: z.array(z.number().int().positive()).min(1).max(3).refine((ids) => new Set(ids).size === ids.length),
}).strict()).min(1).max(8);

export function validateGuide(value: unknown, sources: GuideEvidence[], context?: { name: string; description: string; achievementNames?: string[] }): GuideStep[] {
  const parsed = guideStepsSchema.safeParse(value);
  if (!parsed.success || !sources.length) throw new AppError(502, 'AI_INVALID_RESPONSE');
  const allowed = new Set(sources.map((source) => source.id));
  if (parsed.data.some((step) => step.sourceIds.some((id) => !allowed.has(id)))) throw new AppError(502, 'AI_INVALID_RESPONSE');
  if (context) {
    const last = normalized(parsed.data.at(-1)!.instruction);
    const target = normalized(context.name);
    // Do not save a multi-achievement checklist as one achievement's guide.
    if (/\b(?:achievement|trophy)\b/.test(last) && !last.includes(target)
      && context.achievementNames?.some((name) => {
        const other = normalized(name);
        return other !== target && other.length >= 8 && !normalized(context.description).includes(other) && ` ${last} `.includes(` ${other} `);
      })) throw new AppError(502, 'AI_INVALID_RESPONSE');
  }
  assertParaphrased(parsed.data.map((step) => step.instruction).join(' '), sources);
  return parsed.data;
}

export function assertParaphrased(text: string, sources: GuideEvidence[]) {
  const result = normalized(text);
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const source of sources) {
    const full = normalized(source.excerpt);
    if (full.length > 30 && result.includes(full)) throw new AppError(502, 'AI_INVALID_RESPONSE');
    const sentences = [...segmenter.segment(source.excerpt)].map((part) => part.segment.trim()).filter(Boolean);
    for (let i = 0; i + 2 < sentences.length; i++) {
      const copied = normalized(sentences.slice(i, i + 3).join(' '));
      if (copied && result.includes(copied)) throw new AppError(502, 'AI_INVALID_RESPONSE');
    }
  }
}
