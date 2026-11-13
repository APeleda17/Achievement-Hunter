import { z } from 'zod';
import { AppError } from '../errors.js';
import type { GuideEvidence } from '../sources/types.js';
import { assertParaphrased, validateGuide } from './guideValidation.js';
import { normalized } from '../sources/extract.js';
import type { HelpInput, HelpCause, GuideStep } from './types.js';

export const normalizeProblem = (value: string) => value.normalize('NFC').trim();
export const problemSchema = z.string().transform(normalizeProblem).refine((value) => {
  const length = [...value].length;
  return length >= 1 && length <= 500 && !value.includes('\0');
});
const causesSchema = z.array(z.object({
  reason: z.string().trim().min(10).max(400),
  sourceIds: z.array(z.number().int().positive()).min(1).max(3).refine((ids) => new Set(ids).size === ids.length),
}).strict()).min(1).max(4);

export function validateHelp(value: { causes: unknown; steps: unknown }, sources: GuideEvidence[]) {
  const parsed = causesSchema.safeParse(value.causes);
  if (!parsed.success) throw new AppError(502, 'AI_INVALID_RESPONSE');
  const ids = new Set(sources.map((source) => source.id));
  if (parsed.data.some((cause) => cause.sourceIds.some((id) => !ids.has(id)))) throw new AppError(502, 'AI_INVALID_RESPONSE');
  const steps = validateGuide(value.steps, sources);
  assertParaphrased([...parsed.data.map((cause) => cause.reason), ...steps.map((step) => step.instruction)].join(' '), sources);
  return { causes: parsed.data, steps };
}

export function assertSupportedAdvice(answer: { causes: HelpCause[]; steps: GuideStep[] }, input: HelpInput) {
  for (const item of [...answer.causes, ...answer.steps]) {
    const text = 'instruction' in item ? item.instruction : item.reason;
    const evidence = normalized([input.description, ...input.sources.filter((source) => item.sourceIds.includes(source.id)).map((source) => source.excerpt)].join(' '));
    const output = normalized(text);
    const unsupported = [
      [/\b(?:without dying|no deaths|deathless)\b/, /\b(?:without dying|no deaths|deathless|do not die|dont die)\b/],
      [/\bimmediately\b/, /\b(?:immediately|right away|instantly)\b/],
      [/\breinstall\b/, /\breinstall\b/],
      [/\bverify game files\b/, /\bverify game files\b/],
      [/\bmain menu\b/, /\bmain menu\b/],
      [/\b(?:dropdown|drop down)\b/, /\b(?:dropdown|drop down)\b/],
      [/\bsave file\b/, /\bsave file\b/],
      [/\binteraction key\b/, /\b(?:interact|interaction|press|tap|button)\b/],
    ].some(([claim, support]) => claim.test(output) && !support.test(evidence));
    const keys = 'instruction' in item ? [
      ...text.matchAll(/["'‘’“”]([A-Za-z]|F\d{1,2}|Ctrl|Alt|Shift|Space|Enter)["'‘’“”]/g),
      ...text.matchAll(/\b(?:press|hold|tap)\s+(?:the\s+)?([A-Za-z]|F\d{1,2}|Ctrl|Alt|Shift|Space|Enter)\b/gi),
      ...[...text.matchAll(/\b(?:key|keyboard|button)\b[^.!?\n]{0,60}/gi)]
        .flatMap((context) => [...context[0].matchAll(/\b([A-Z]|F\d{1,2}|Ctrl|Alt|Shift|Space|Enter)\b/g)]),
    ].map((match) => normalized(match[1])) : [];
    if (unsupported || keys.some((key) => !` ${evidence} `.includes(` ${key} `))) {
      throw new AppError(502, 'AI_INVALID_RESPONSE', 'Unsupported controls, menu locations or new restrictions. Remove unverified keys, menu paths, immediate pickup deadlines and deathless requirements. Use only explicitly supported checks.');
    }
  }
}
