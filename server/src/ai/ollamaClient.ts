import { z } from 'zod';
import { AppError } from '../errors.js';
import { EXPLAIN_SYSTEM_PROMPT, GUIDE_SYSTEM_PROMPT } from './prompts.js';
import type { AiClient, AssessmentAiClient, GuideAiClient, HelpAiClient } from './types.js';
import { createOllamaHelp } from './ollamaHelp.js';
import { createOllamaAssess } from './ollamaAssess.js';
import { validateGuide } from './guideValidation.js';
import { normalized } from '../sources/extract.js';
import { missionGoalFor, validateMissionGoal } from './achievementGoals.js';

export const characterCount = (value: string) => [...value.normalize('NFC')].length;
const explanationSchema = z.object({
  explanation: z.string().trim().min(1).max(2000),
  language: z.literal('en'),
}).strict();
const envelopeSchema = z.object({
  done: z.literal(true),
  message: z.object({ role: z.literal('assistant'), content: z.string().max(16_000) }),
});

// Sutrumpinant negalima pakeisti užduoties: pvz., „get“ nėra „mount“.
const actionVerbs = new Set(['get', 'kill', 'collect', 'complete', 'defeat', 'win', 'finish', 'find', 'break', 'escape', 'reach', 'survive', 'unlock', 'obtain', 'acquire', 'use', 'build', 'destroy', 'save', 'rescue', 'deliver', 'equip', 'craft', 'upgrade', 'explore', 'visit', 'discover', 'earn', 'score', 'take', 'open', 'close', 'beat']);
function openingAction(text: string) {
  const first = text.trim().match(/^[a-z]+/i)?.[0];
  return first && actionVerbs.has(first.toLowerCase()) ? first : undefined;
}

export function validateExplanation(text: string, original: string): string {
  const value = text.trim();
  if (!value || characterCount(value) >= characterCount(original.trim()) || value.length > 2000) {
    throw new AppError(502, 'AI_INVALID_RESPONSE');
  }
  const numbers = (source: string) => (source.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((number) => number.replace(',', '.').replace(/^0+(?=\d)/, ''));
  const outputNumbers = new Set(numbers(value));
  if (numbers(original).some((number) => !outputNumbers.has(number))) throw new AppError(502, 'AI_INVALID_RESPONSE');
  const requiredAction = openingAction(original);
  if (requiredAction && value.match(/^[a-z]+/i)?.[0].toLowerCase() !== requiredAction.toLowerCase()) {
    throw new AppError(502, 'AI_INVALID_RESPONSE');
  }
  return value;
}

// DIK yra vienintelė vieta, kurioje kviečiama Ollama HTTP API.
export function createOllamaClient(options: {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}): AiClient & GuideAiClient & HelpAiClient & AssessmentAiClient {
  const send = options.fetch ?? fetch;
  return {
    help: createOllamaHelp(options),
    assess: createOllamaAssess(options),
    async guide(input, parentSignal) {
      const missionGoal = missionGoalFor(input);
      const condition = normalized(input.description);
      const sparseEvidence = input.sources.every((source) => {
        const remainder = normalized(source.excerpt).replace(normalized(input.name), '').replace(condition, '').trim();
        return normalized(source.excerpt).split(' ').length <= 55 || (!!condition && remainder.split(/\s+/).filter(Boolean).length <= 10);
      });
      const conditionOnly = !!condition && sparseEvidence;
      const maxSteps = sparseEvidence ? 1 : 8;
      const controller = new AbortController();
      const abort = () => controller.abort();
      parentSignal.addEventListener('abort', abort, { once: true });
      if (parentSignal.aborted) abort();
      const timer = setTimeout(abort, Math.min(options.timeoutMs ?? 90_000, 90_000));
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          controller.signal.throwIfAborted();
          const response = await send(new URL('/api/chat', options.baseUrl), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({
              model: options.model, stream: false,
              ...(/qwen3/i.test(options.model) ? { think: false } : {}),
              messages: [
                { role: 'system', content: GUIDE_SYSTEM_PROMPT + (sparseEvidence
                  ? '\nThese sources contain only brief evidence. Return exactly ONE concise action using the explicit mission/item/goal from the excerpts and original condition. Do not expand it into a detailed walkthrough or invent how medals, levels, menus, unlocks or controls work.' : '')
                  + (missionGoal ? '\nmissionGoal identifies ONE specific campaign mission. Include its exact name and the word "mission" in the instruction. Completing that mission does NOT mean completing the entire campaign, even when the mission title resembles the game title.' : '') },
                { role: 'user', content: JSON.stringify({ game: input.gameName, achievement: input.name, condition: input.description,
                  maxSteps, evidenceMode: conditionOnly ? 'condition_only' : 'walkthrough',
                  ...(missionGoal ? { missionGoal } : {}),
                  sources: input.sources.map(({ id, title, excerpt }) => ({ id, title, excerpt })),
                  ...(attempt ? { validationFeedback: 'Invalid draft or copied source sentences. Write 1-8 paraphrased steps, use only provided source IDs. One step is enough for a simple goal confirmed by a guide. If evidence is insufficient, return hasReliableInfo=false.' } : {}),
                }) },
              ],
              format: { type: 'object', additionalProperties: false, required: ['hasReliableInfo', 'steps', 'language'],
                properties: { hasReliableInfo: { type: 'boolean' }, language: { type: 'string', enum: ['en'] },
                  steps: { type: 'array', maxItems: maxSteps, items: { type: 'object', additionalProperties: false,
                    required: ['instruction', 'sourceIds'], properties: { instruction: { type: 'string' },
                      sourceIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'integer', enum: input.sources.map((s) => s.id) } } } } } } },
              options: { temperature: 0, num_predict: sparseEvidence ? 350 : 1500, num_ctx: 8192 }, keep_alive: '10m',
            }),
          });
          if (!response.ok) throw new AppError(503, 'AI_UNAVAILABLE');
          try {
            const envelope = envelopeSchema.parse(await response.json());
            const parsed = z.object({ hasReliableInfo: z.boolean(), language: z.literal('en'), steps: z.array(z.unknown()).max(8) }).strict().parse(JSON.parse(envelope.message.content));
            controller.signal.throwIfAborted();
            if (!parsed.hasReliableInfo) throw new AppError(422, 'NO_RELIABLE_INFO');
            if (parsed.steps.length > maxSteps) throw new AppError(502, 'AI_INVALID_RESPONSE');
            const steps = validateGuide(parsed.steps, input.sources);
            validateMissionGoal(steps.map((step) => step.instruction).join(' '), missionGoal);
            return { steps, model: options.model };
          } catch (error) {
            controller.signal.throwIfAborted();
            if (error instanceof AppError && error.code === 'NO_RELIABLE_INFO') throw error;
            if (attempt === 0) continue;
            throw new AppError(502, 'AI_INVALID_RESPONSE');
          }
        }
        throw new AppError(502, 'AI_INVALID_RESPONSE');
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(503, 'AI_UNAVAILABLE');
      } finally { clearTimeout(timer); parentSignal.removeEventListener('abort', abort); }
    },
    async explain(input, parentSignal) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      parentSignal.addEventListener('abort', abort, { once: true });
      if (parentSignal.aborted) abort();
      const timer = setTimeout(abort, Math.min(options.timeoutMs ?? 90_000, 90_000));
      const maxCharacters = Math.min(2000, characterCount(input.description.trim()) - 1);
      const maxWords = Math.max(1, input.description.trim().split(/\s+/).length - 1);
      let validationFeedback: { previousExplanation: string; previousCharacterCount: number; error: string } | undefined;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          controller.signal.throwIfAborted();
          const response = await send(new URL('/api/chat', options.baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              model: options.model,
              stream: false,
              ...(/qwen3/i.test(options.model) ? { think: false } : {}),
              messages: [
                { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify({ ...input, maxCharacters, maxWords, requiredOpeningVerb: openingAction(input.description),
                  ...(validationFeedback ? { validationFeedback } : {}),
                }) },
              ],
              format: {
                type: 'object', additionalProperties: false,
                properties: {
                  explanation: { type: 'string', minLength: 1 },
                  language: { type: 'string', enum: ['en'] },
                },
                required: ['explanation', 'language'],
              },
              options: { temperature: 0, num_predict: 300, num_ctx: 4096 },
              keep_alive: '10m',
            }),
          });
          if (!response.ok) throw new AppError(503, 'AI_UNAVAILABLE');
          let candidate = '';
          try {
            // Negrąžiname modelio atsakymo ar techninių detalių klaidos pranešime.
            const envelope = envelopeSchema.parse(await response.json());
            const content = explanationSchema.parse(JSON.parse(envelope.message.content));
            candidate = content.explanation;
            controller.signal.throwIfAborted();
            return { text: validateExplanation(content.explanation, input.description), model: options.model };
          } catch {
            controller.signal.throwIfAborted();
            validationFeedback = { previousExplanation: candidate, previousCharacterCount: characterCount(candidate),
              error: `Invalid JSON, changed action, missing number, or not shorter than original. Limits: ${maxWords} words and ${maxCharacters} characters. Start with ${openingAction(input.description) ?? 'the original action'}, keep the exact item; omit articles and redundant wording.` };
            // Vienas pakartojimas telpa į tą pačią bendrą 90 s ribą; teksto nenukerpame.
            if (attempt === 0) continue;
            throw new AppError(502, 'AI_INVALID_RESPONSE');
          }
        }
        throw new AppError(502, 'AI_INVALID_RESPONSE');
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(503, 'AI_UNAVAILABLE');
      } finally {
        clearTimeout(timer);
        parentSignal.removeEventListener('abort', abort);
      }
    },
  };
}
