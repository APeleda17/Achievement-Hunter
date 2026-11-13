import { describe, expect, it, vi } from 'vitest';
import { createSourcesService } from '../src/sources/sourcesService.js';
import { SourceReadError } from '../src/sources/sourceHttp.js';
import type { SourceCandidate, SourceQuery } from '../src/sources/types.js';

const url = (id: number) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
const query: SourceQuery = { achievementId: 1, appId: 306020, gameName: 'Bloons TD5', name: 'Highlander', description: 'Win a game with one tower.' };
const guide = (text: string, title = 'Highlander') => `<a class="apphub_sectionTab" href="https://steamcommunity.com/app/306020/guides/">Guides</a><div class="workshopItemTitle">100% guide</div><div class="subSection"><div class="subSectionTitle">${title}</div><div class="subSectionDesc">${text}</div></div>`;
const listing = (ids: number[]) => ids.map((id) => `<a href="${url(id)}">Guide ${id}</a>`).join('');
const repo = () => ({ cached: vi.fn().mockResolvedValue([]), save: vi.fn(async (_id: number, _hash: string, items: SourceCandidate[]) => items.map((item, i) => ({ ...item, id: i + 1, fetchedAt: item.fetchedAt ?? new Date() }))) });

describe('Bendra Steam gidų paieška kiekvienam appId', () => {
  it('randa pasiekimą ir už pirmųjų trijų gidų ribų; renkasi anglų kalbą', async () => {
    const get = vi.fn(async (value: string) => value.includes('/guides/') ? listing([1, 2, 3, 4, 5, 6])
      : value === url(6) ? guide('Play the whole match with a single upgraded tower on an easy map.') : guide('Other unrelated instructions', 'Other'));
    const result = await createSourcesService(repo(), { get }).collect(query, new AbortController().signal);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(url(6));
    const search = new URL(get.mock.calls[0][0]);
    expect(search.searchParams.getAll('requiredtags[]')).toContain('English');
  });
  it('neradus kategorijoje ieško ir tarp neteisingai sužymėtų gidų', async () => {
    const get = vi.fn(async (value: string) => value.includes('/guides/')
      ? new URL(value).searchParams.get('searchText') === 'achievement' ? listing([9]) : '<p>No results</p>'
      : guide('Play the whole match with a single upgraded tower on an easy map.'));
    expect(await createSourcesService(repo(), { get }).collect(query, new AbortController().signal)).toHaveLength(1);
    expect(get.mock.calls.some(([value]) => new URL(value).searchParams.get('searchText') === 'achievement')).toBe(true);
  });
  it('kito to paties žaidimo pasiekimo ištraukai naudoja tą patį indeksą be HTTP', async () => {
    const get = vi.fn(async (value: string) => value.includes('/guides/') ? listing([1]) : guide('Win a game with one tower.') + guide('Go to the lake and finish all required map difficulties.', 'Lake Olympian'));
    const repository = repo();
    const collector = createSourcesService(repository, { get });
    const first = await collector.collect(query, new AbortController().signal);
    const calls = get.mock.calls.length;
    const second = await collector.collect({ ...query, achievementId: 2, name: 'Lake Olympian', description: '' }, new AbortController().signal);
    expect(second[0].excerpt).toContain('lake');
    expect(get).toHaveBeenCalledTimes(calls);
    expect(second[0].fetchedAt).toEqual(first[0].fetchedAt);
  });
  it('šaltinių paieškos laikas ribotas ir palieka 90 s modeliui', async () => {
    const get = vi.fn((_value: string, signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const repository = repo();
    await expect(createSourcesService(repository, { get }, { budgetMs: 15 }).collect(query, new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCES_UNAVAILABLE' });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('429 atskiria nuo informacijos nebuvimo ir nebetęsia paieškos', async () => {
    const get = vi.fn().mockRejectedValue(new SourceReadError('RATE_LIMITED'));
    await expect(createSourcesService(repo(), { get }).collect(query, new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCES_UNAVAILABLE' });
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('vieno gido ribojimas nesustabdo likusių leidžiamų gidų', async () => {
    const get = vi.fn(async (value: string) => {
      if (value.includes('/guides/')) return listing([1, 2]);
      if (value === url(1)) throw new SourceReadError('RATE_LIMITED', 'resource');
      return guide('Win a game with one tower.');
    });
    expect(await createSourcesService(repo(), { get }).collect(query, new AbortController().signal)).toHaveLength(1);
  });
  it('Steam turinio perspėjimo nelaiko patikimos informacijos nebuvimu ir nieko nepatvirtina naudotojo vardu', async () => {
    const get = vi.fn().mockResolvedValue('<div class="contentcheck_header">Content preferences</div>');
    await expect(createSourcesService(repo(), { get }).collect(query, new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCES_UNAVAILABLE' });
  });
  it('pasibaigus paieškos biudžetui grąžina jau rastą tinkamą šaltinį', async () => {
    const get = vi.fn(async (value: string, signal: AbortSignal) => {
      if (value.includes('/guides/')) return listing([1, 2]);
      if (value === url(1)) return guide('Play the whole match with a single upgraded tower on an easy map.');
      return new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const signal = new AbortController().signal;
    expect(await createSourcesService(repo(), { get }, { budgetMs: 20 }).collect(query, signal)).toHaveLength(1);
    expect(signal.aborted).toBe(false);
  });
  it('Enhanced gali naudoti tik patvirtintos Legacy versijos gidą, pažymėdamas versiją', async () => {
    const q = { ...query, appId: 3240220, gameName: 'Grand Theft Auto V Enhanced', name: 'Welcome to Los Santos', description: '' };
    const get = vi.fn(async (value: string) => value.includes('/app/3240220/') ? '<p>No guides</p>'
      : value.includes('/guides/') ? listing([1]) : guide('Finish Franklin and Lamar, then return the car to the dealership.', q.name).replace('/app/306020/', '/app/271590/'));
    const result = await createSourcesService(repo(), { get }).collect(q, new AbortController().signal);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('Grand Theft Auto V Legacy');
  });
  it('atmeta kito žaidimo gidą, kai versijų atitikmuo nepatvirtintas', async () => {
    const get = vi.fn(async (value: string) => value.includes('/guides/') ? listing([1]) : guide('Win a game with one tower.').replace('/app/306020/', '/app/999999/'));
    expect(await createSourcesService(repo(), { get }).collect(query, new AbortController().signal)).toEqual([]);
  });
});
