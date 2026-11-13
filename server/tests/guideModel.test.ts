import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOllamaClient } from '../src/ai/ollamaClient.js';
import { validateGuide } from '../src/ai/guideValidation.js';

const source = { id: 7, title: 'Walkthrough', url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=1', type: 'STEAM_GUIDE' as const, fetchedAt: new Date(),
  excerpt: 'Visit the eastern tower. Climb to the very top. Open the locked chest. Take the golden key. The tower entrance is on the east side of the courtyard, beyond the old stone bridge. Wait for the rotating barrier to lower before crossing. Once inside, follow the staircase all the way upward and look for the chest on the landing beside the final window.' };
const input = { gameName: 'Game', name: 'Key Collector', description: 'Get the golden key.', sources: [source] };
const steps = [{ instruction: 'Go to the tower on the east side and ascend it.', sourceIds: [7] }, { instruction: 'At the summit, unlock the chest and retrieve the key.', sourceIds: [7] }];
const envelope = (value: unknown) => new Response(JSON.stringify({ done: true, message: { role: 'assistant', content: JSON.stringify(value) } }));

describe('DIK-03,05: šaltiniais paremtas vadovas', () => {
  afterEach(() => vi.useRealTimers());
  it('siunčia tik šaltinių tekstą ir ID; laiko jį nepatikimais duomenimis', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(envelope({ hasReliableInfo: true, language: 'en', steps }));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'qwen3.5:9b', fetch: send });
    expect(await ai.guide(input, new AbortController().signal)).toEqual({ model: 'qwen3.5:9b', steps });
    const sent = JSON.parse(send.mock.calls[0][1]!.body as string);
    expect(sent).toMatchObject({ think: false, stream: false, options: { temperature: 0, num_ctx: 8192 } });
    expect(sent.messages[0].content).toMatch(/untrusted/i);
    expect(sent.messages[0].content).toMatch(/only/i);
    const data = JSON.parse(sent.messages[1].content);
    expect(data.sources).toEqual([{ id: 7, title: source.title, excerpt: source.excerpt }]);
    expect(JSON.stringify(sent)).not.toContain(source.url);
  });
  it('modeliui pranešus, kad informacijos nepakanka, nekuria tariamo vadovo ir nekartoja kvietimo', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(envelope({ hasReliableInfo: false, language: 'en', steps: [] }));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'fake', fetch: send });
    await expect(ai.guide(input, new AbortController().signal)).rejects.toMatchObject({ code: 'NO_RELIABLE_INFO' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([
    [], Array(9).fill(steps[0]),
    [{ instruction: 'too short', sourceIds: [7] }, steps[1]],
    [{ ...steps[0], sourceIds: [999] }, steps[1]],
    [{ ...steps[0], sourceIds: [] }, steps[1]],
    [{ ...steps[0], extra: true }, steps[1]],
  ])('blogą žingsnių schemą ar citatą atmeta: %j', (value) => {
    expect(() => validateGuide(value, [source])).toThrow('AI_INVALID_RESPONSE');
  });
  it('atmeta tris iš eilės kopijuotus sakinius net kai jie padalyti į kelis žingsnius', () => {
    expect(() => validateGuide([
      { instruction: 'Visit the eastern tower. Climb to the very top.', sourceIds: [7] },
      { instruction: 'Open the locked chest.', sourceIds: [7] },
    ], [source])).toThrow('AI_INVALID_RESPONSE');
    expect(() => validateGuide([{ instruction: source.excerpt, sourceIds: [7] }, steps[1]], [source])).toThrow();
    expect(validateGuide(steps, [source])).toEqual(steps);
  });
  it('paprastam pasiekimui priima vieną šaltiniu paremtą žingsnį', () => {
    expect(validateGuide([steps[0]], [source])).toEqual([steps[0]]);
  });
  it('kai šaltinis patvirtina tik paprastą sąlygą, neleidžia modeliui išgalvoti kelių etapų', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(envelope({ hasReliableInfo: true, language: 'en', steps: [{ instruction: 'Earn all 3 medals on the 3 Times Around map.', sourceIds: [7] }] }));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'fake', fetch: send });
    await ai.guide({ gameName: 'Bloons TD5', name: '3 Times Around Olympian', description: 'Earn all 3 medals on 3 Times Around map',
      sources: [{ ...source, excerpt: '3 Times Around Olympian - Earn all 3 medals on 3 Times Around map' }] }, new AbortController().signal);
    const body = JSON.parse(send.mock.calls[0][1]!.body as string);
    expect(body.format.properties.steps.maxItems).toBe(1);
    expect(JSON.parse(body.messages[1].content).evidenceMode).toBe('condition_only');
  });
  it('atmeta vadovą, kurio paskutinis žingsnis užbaigia kitą pasiekimą', () => {
    expect(() => validateGuide([{ instruction: 'Finish all the races to unlock the World Traveler achievement.', sourceIds: [7] }], [source],
      { name: 'Key Collector', description: 'Get the key.', achievementNames: ['Key Collector', 'World Traveler'] })).toThrow('AI_INVALID_RESPONSE');
  });
  it('Black Ops misijos nepaverčia visos kampanijos reikalavimu', async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({ hasReliableInfo: true, language: 'en', steps: [{ instruction: 'Complete the entire campaign on Hardened difficulty.', sourceIds: [7] }] }))
      .mockResolvedValueOnce(envelope({ hasReliableInfo: true, language: 'en', steps: [{ instruction: 'Complete the mission Black Ops on Hardened, Veteran, or Realistic difficulty.', sourceIds: [7] }] }));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'fake', fetch: send });
    const result = await ai.guide({ gameName: 'Call of Duty: Black Ops III', name: 'Disavowed', description: 'Complete Black Ops on Hardened, Veteran, or Realistic.',
      sources: [{ ...source, excerpt: 'Disavowed - Complete Black Ops on Hardened, Veteran or Realistic.' }] }, new AbortController().signal);
    expect(result.steps[0].instruction).toContain('mission Black Ops');
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('netinkamą rezultatą pakartoja tik kartą, abu kartus patikrina', async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({ hasReliableInfo: true, language: 'en', steps: [{ ...steps[0], sourceIds: [999] }, steps[1]] }))
      .mockResolvedValueOnce(envelope({ hasReliableInfo: true, language: 'en', steps }));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'fake', fetch: send });
    expect((await ai.guide(input, new AbortController().signal)).steps).toEqual(steps);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[1][1]!.body as string).messages[1].content).toContain('validationFeedback');
  });
  it('neužbaigto ar netaisyklingo JSON po pakartojimo nepriima', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('not json'));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'fake', fetch: send });
    await expect(ai.guide(input, new AbortController().signal)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('90 s riba galioja visam generavimui su pakartojimu', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(envelope({ hasReliableInfo: true, language: 'en', steps: [] }))
      .mockImplementation((_url, options) => new Promise((_resolve, reject) => {
        signal = options!.signal!;
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }));
    const ai = createOllamaClient({ baseUrl: 'http://localhost:11434', model: 'fake', fetch: send });
    const result = expect(ai.guide(input, new AbortController().signal)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(89999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(signal.aborted).toBe(true);
  });
});
