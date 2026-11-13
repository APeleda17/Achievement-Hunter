import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSourceHttp } from '../src/sources/sourceHttp.js';
import { allowedSourceUrl } from '../src/sources/registry.js';
import { extractRelevant, steamGuideLinks } from '../src/sources/extract.js';
import { createSourcesService } from '../src/sources/sourcesService.js';
import { createSourcesRepo } from '../src/db/sourcesRepo.js';
import { sourceQueryHash, SOURCE_TTL_MS, type SourceQuery } from '../src/sources/types.js';
import { prisma, resetDb } from './helpers.js';

const url = 'https://steamcommunity.com/sharedfiles/filedetails/?id=123';
const query: SourceQuery = { achievementId: 1, appId: 220, gameName: 'Half-Life 2', name: 'Trusty Hardware', description: 'Get the crowbar.' };
const content = 'Trusty Hardware<br>Get the crowbar.<br>In Chapter 2, follow the walkway until Barney calls you from above. Wait under him and pick up the crowbar after he drops it on the ground.';
const html = (text = content, appId = 220) => `<div class="workshopItemTitle">Walkthrough</div><a class="apphub_sectionTab" href="https://steamcommunity.com/app/${appId}/guides/">Guides</a><div class="subSectionDesc">${text}</div>`;

describe('ISR-01,02: tik susijusios leidžiamų puslapių ištraukos', () => {
  it.each(['http://steamcommunity.com/sharedfiles/filedetails/?id=1', 'https://steamcommunity.com.evil.test/sharedfiles/filedetails/?id=1', 'https://127.0.0.1/wiki/Test', 'https://user:pass@theportalwiki.com/wiki/Test', 'https://theportalwiki.com:444/wiki/Test', 'https://wiki.teamfortress.com/w/api.php', 'https://theportalwiki.com/wiki/Special:Search'])('neleidžia %s', (value) => {
    expect(allowedSourceUrl(value)).toBe(false);
  });
  it('parenka pasiekimo skyrių, pašalina skriptus ir sustoja prieš kitą pasiekimą', () => {
    const source = extractRelevant(html(`${content}<script>secret()</script><br>Achievement #6 – Other:<br>unrelated`), url, query);
    expect(source?.excerpt).toContain('Barney');
    expect(source?.excerpt).not.toContain('unrelated');
    expect(source?.excerpt).not.toContain('secret');
  });
  it('randa pavadinimą Steam skyriaus antraštėje, kuri yra už aprašo ribų', () => {
    const page = html('').replace('<div class="subSectionDesc"></div>', '<div class="subSection"><div class="subSectionTitle">Trusty Hardware</div><div class="subSectionDesc">Wait for Barney to drop the crowbar, then pick it up from the ground.</div></div>');
    expect(extractRelevant(page, url, query)?.excerpt).toContain('Wait for Barney');
  });
  it('leidžia trumpą paprasto pasiekimo instrukciją ir neieško dalinio žodžio', () => {
    expect(extractRelevant(html('Trusty Hardware<br>Get the crowbar.'), url, query)).not.toBeNull();
    expect(extractRelevant(html('Checkpoints<br>Go through the level and then jump across the bridge.'), url, { ...query, name: 'Point', description: '' })).toBeNull();
  });
  it('neįtraukia kito žinomo pasiekimo, net kai pavadinimai yra tik paryškinti', () => {
    const page = html('<b>Trusty Hardware</b><br>Get the crowbar.<br>Wait for Barney, then pick up the crowbar.<br><b>Malcontent</b><br>Unrelated mission instructions go here.');
    const source = extractRelevant(page, url, { ...query, achievementNames: ['Trusty Hardware', 'Malcontent'] });
    expect(source?.excerpt).toContain('Barney');
    expect(source?.excerpt).not.toContain('Malcontent');
    expect(source?.excerpt).not.toContain('Unrelated');
  });
  it('atpažįsta nedidelę bendruomenės gido pavadinimo rašybos klaidą', () => {
    const page = html('A Friendship Ressurected<br>Complete the Fame or Shame mission in the main story campaign.');
    expect(extractRelevant(page, url, { ...query, name: 'A Friendship Resurrected', description: '' })?.excerpt).toContain('Fame or Shame');
  });
  it('stabdo ir prieš kitą pasiekimą, kurio pavadinime gidas padarė rašybos klaidą', () => {
    const page = html('Welcome to Los Santos<br>Finish the Franklin and Lamar mission to unlock this story achievement.<br>A Friendship Ressurected<br>Complete Fame or Shame to unlock another achievement.');
    const result = extractRelevant(page, url, { ...query, name: 'Welcome to Los Santos', description: '', achievementNames: ['Welcome to Los Santos', 'A Friendship Resurrected'] });
    expect(result?.excerpt).toContain('Franklin');
    expect(result?.excerpt).not.toContain('Fame or Shame');
  });
  it('neliečia kitų pasiekimų eilučių, kai po pavadinimo yra ilga sąlyga', () => {
    const result = extractRelevant(html('Highlander - Complete the There Can Only Be One Special Mission<br>Short-Lived - Complete another completely different special mission with many additional restrictions.'), url,
      { ...query, name: 'Highlander', description: 'Complete the There Can Only Be One Special Mission', achievementNames: ['Highlander', 'Short-Lived'] });
    expect(result?.excerpt).not.toContain('Short-Lived');
  });
  it('dedikuotas gidas gali pasiekimą įvardyti tik savo puslapio antraštėje', () => {
    const page = html('Go to the laboratory and collect the crowbar from the character near the door.').replace('Walkthrough', 'Trusty Hardware Guide');
    expect(extractRelevant(page, url, query)?.excerpt).toContain('laboratory');
  });
  it('naudoja originalią sąlygą kaip alternatyvą, kai gide vartojamas kitas pavadinimas', () => {
    const description = 'Find the hidden laboratory below the eastern bridge.';
    const page = html(`Alternate name<br>${description}<br>Enter through the lower door and follow the corridor to the final room.`);
    expect(extractRelevant(page, url, { ...query, description })?.excerpt).toContain('corridor');
  });
  it('trumpą sąlygą su skaičiumi randa ir su Lv/Lvl santrumpa', () => {
    const source = extractRelevant(html('Reach Lv. 5<br>Collect experience gems from defeated enemies.'), url,
      { ...query, name: 'Wings', description: 'Reach Level 5.' });
    expect(source?.excerpt).toContain('Reach Lv. 5');
  });
  it('žodžio Wings paminėjimo kito pasiekimo instrukcijoje nelaiko Wings vadovu', () => {
    const source = extractRelevant(html('Purchase She-Moon Eeta and fuse the starting weapon with the Wings passive item to trigger a different event.'), url,
      { ...query, name: 'Wings', description: 'Reach Level 5.' });
    expect(source).toBeNull();
  });
  it('sąlygą atitinkančią ištrauką reitinguoja aukščiau už tokio pat pavadinimo daikto aprašymą', () => {
    const page = html('').replace('<div class="subSectionDesc"></div>', '<div class="subSection"><div class="subSectionTitle">Wings</div><div class="subSectionDesc">Buy the Wings passive item to upgrade the speed of your hero.</div></div><div class="subSection"><div class="subSectionTitle">Unlocks</div><div class="subSectionDesc">Reach Level 5.<br>Collect gems dropped by enemies to gain experience.</div></div>');
    expect(extractRelevant(page, url, { ...query, name: 'Wings', description: 'Reach Level 5.' })?.excerpt).toContain('gems');
  });
  it('atskiria Steam bb_table eiles, kad vienas pasiekimas negautų visos lentelės', () => {
    const page = html('<div class="bb_table"><div class="bb_table_tr"><div class="bb_table_td">Wings</div><div class="bb_table_td">Reach level 5</div></div><div class="bb_table_tr"><div class="bb_table_td">Crown</div><div class="bb_table_td">Reach level 10</div></div></div>');
    const source = extractRelevant(page, url, { ...query, name: 'Wings', description: 'Reach Level 5.', achievementNames: ['Wings', 'Crown'] });
    expect(source?.excerpt).toContain('Reach level 5');
    expect(source?.excerpt).not.toContain('Crown');
    expect(source?.excerpt).not.toContain('level 10');
  });
  it('vieno pasiekimo gido veiksmus randa atskirame skyriuje', () => {
    const page = html('').replace('<div class="subSectionDesc"></div>', '<div class="subSection"><div class="subSectionTitle">List of achievements</div><div class="subSectionDesc">Trusty Hardware<br>Get the crowbar.</div></div><div class="subSection"><div class="subSectionTitle">Steps to follow</div><div class="subSectionDesc">Wait for Barney in Chapter 2 and collect the crowbar he drops on the floor.</div></div>');
    expect(extractRelevant(page, url, query)?.excerpt).toContain('Wait for Barney');
  });
  it('nepriima kito žaidimo, nesusijusio teksto ar vien pasiekimo pavadinimo', () => {
    expect(extractRelevant(html(content, 620), url, query)).toBeNull();
    expect(extractRelevant(html(content.replaceAll('Trusty Hardware', 'Other').replace('Get the crowbar.', 'Reach the exit.')), url, query)).toBeNull();
    expect(extractRelevant(html('Trusty Hardware'), url, query)).toBeNull();
    expect(extractRelevant(html('Trusty Hardware<br>Get the crowbar.'), url, query)?.excerpt).toContain('Get the crowbar.');
  });
  it('wiki ištrauką riboja 4000 simbolių ir sustoja ties kitu skyriumi', () => {
    const page = `<h1 id="firstHeading">Achievements</h1><div id="mw-content-text"><div class="mw-parser-output"><h2>Trusty Hardware</h2><p>${'Follow Barney and pick up the crowbar. '.repeat(200)}</p><h2>Other</h2><p>Other content</p></div></div>`;
    const source = extractRelevant(page, 'https://combineoverwiki.net/wiki/Half-Life_2_achievements', query);
    expect(source?.type).toBe('WIKI');
    expect([...source!.excerpt]).toHaveLength(4000);
    expect(source?.excerpt).not.toContain('Other content');
  });
  it('Steam nuorodas deduplikuoja, pašalina pašalinius URL ir taiko pasirinktą ribą', () => {
    const links = steamGuideLinks([url, `${url}&x=1`, 'https://evil.test/sharedfiles/filedetails/?id=9', ...[2, 3, 4].map((id) => url.replace('123', String(id)))].map((href) => `<a href="${href}">Guide</a>`).join(''), '', 3);
    expect(links).toEqual([url, url.replace('123', '2'), url.replace('123', '3')]);
  });
  it('pilną gidą kelia aukščiau už pavienius nesusijusius gidus ir neriboja paieškos trimis', () => {
    const cards = Array.from({ length: 8 }, (_, index) => `<a href="${url.replace('123', String(index + 1))}"><div class="workshopItemTitle">${index === 7 ? 'Complete 100% Achievement Guide' : 'Single challenge'}</div></a>`).join('');
    const links = steamGuideLinks(cards);
    expect(links).toHaveLength(8);
    expect(links[0]).toBe(url.replace('123', '8'));
  });
});

describe('ISR-04: robots.txt, HTTP ribos ir peradresavimai', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('robots draudimą gerbia ir paties puslapio neskaito', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('User-agent: *\nDisallow: /sharedfiles/'));
    await expect(createSourceHttp({ fetch: send }).get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'POLICY' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('robots.txt 404 leidžia, bet 503 atveju puslapio neskaito', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response('page'));
    expect(await createSourceHttp({ fetch: send }).get(url, new AbortController().signal)).toBe('page');
    expect(send.mock.calls[1][1]).toMatchObject({ redirect: 'manual' });
    expect(send.mock.calls[1][1]?.headers).not.toHaveProperty('Cookie');
    const broken = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(createSourceHttp({ fetch: broken }).get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'POLICY' });
    expect(broken).toHaveBeenCalledTimes(1);
  });
  it('nukreipimo į localhost ar kitą domeną nevykdo', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
    await expect(createSourceHttp({ fetch: send }).get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'POLICY' });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('atmeta per didelį atsakymą net be Content-Length', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('x'.repeat(2_000_001)));
    await expect(createSourceHttp({ fetch: send }).get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });
  it('429 ir Retry-After sustabdo tolesnes užklausas tam pačiam serveriui', async () => {
    let now = Date.now();
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response('Too many requests', { status: 429, headers: { 'retry-after': '120' } }))
      .mockResolvedValueOnce(new Response('Page'));
    const http = createSourceHttp({ fetch: send, now: () => now });
    await expect(http.get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(http.get(url.replace('123', '456'), new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(send).toHaveBeenCalledTimes(2);
    now += 121000;
    expect(await http.get(url, new AbortController().signal)).toBe('Page');
    expect(String(send.mock.calls[2][0])).toContain('l=english');
  });
  it('429 be Retry-After nekartoja to paties gido ir sulėtina kitų puslapių skaitymą', async () => {
    let now = Date.now();
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response('Limited guide', { status: 429 }))
      .mockResolvedValueOnce(new Response('Another guide'));
    const http = createSourceHttp({ fetch: send, now: () => now });
    await expect(http.get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED', scope: 'resource' });
    await expect(http.get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(send).toHaveBeenCalledTimes(2);
    now += 2100;
    expect(await http.get(url.replace('123', '456'), new AbortController().signal)).toBe('Another guide');
  });
  it('10 s riba galioja ir robots.txt užklausai', async () => {
    vi.useFakeTimers();
    let inner!: AbortSignal;
    const send = vi.fn<typeof fetch>((_url, options) => new Promise((_resolve, reject) => {
      inner = options!.signal!;
      inner.addEventListener('abort', () => reject(new Error('cancelled')));
    }));
    const outcome = expect(createSourceHttp({ fetch: send }).get(url, new AbortController().signal)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(9999);
    expect(inner.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(inner.aborted).toBe(true);
  });
  it('Crawl-delay išlaiko tarp puslapių ir robots taisykles naudoja iš talpyklos', async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('User-agent: *\nCrawl-delay: 2')).mockImplementation(async () => new Response('page'));
    const http = createSourceHttp({ fetch: send });
    await http.get(url, new AbortController().signal);
    const next = http.get(url.replace('123', '456'), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1999);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe('ISR-03: 30 dienų ištraukų talpykla su Prisma', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.game.create({ data: { appId: 220, name: query.gameName } });
    await prisma.achievement.create({ data: { id: 1, appId: 220, apiName: 'A', name: query.name, description: query.description } });
  });
  it('šaltinius surenka ir 30 dienų pakartotinai nesiunčia HTTP; vėliau atnaujina', async () => {
    const http = { get: vi.fn(async (value: string) => value.includes('/guides/') ? `<a href="${url}">Guide</a>`
      : value.includes('combineoverwiki') ? `<h1 id="firstHeading">Achievements</h1><div id="mw-content-text">${content}</div>` : html()) };
    const service = createSourcesService(createSourcesRepo(prisma), http);
    const signal = new AbortController().signal;
    const result = await service.collect(query, signal);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const calls = http.get.mock.calls.length;
    expect(await service.collect(query, signal)).toEqual(result);
    expect(http.get).toHaveBeenCalledTimes(calls);
    await prisma.sourceExcerpt.updateMany({ data: { fetchedAt: new Date(Date.now() - SOURCE_TTL_MS - 1000) } });
    // After 30 real days the process's 15-minute parsed-page cache is also gone.
    await createSourcesService(createSourcesRepo(prisma), http).collect(query, signal);
    expect(http.get.mock.calls.length).toBeGreaterThan(calls);
  });
  it('tas pats URL turi atskiras ištraukas skirtingiems pasiekimams ir pasikeitus užklausai nelaikomas tinkamu', async () => {
    const repo = createSourcesRepo(prisma);
    const candidate = { url, title: 'Guide', type: 'STEAM_GUIDE' as const, excerpt: 'First achievement excerpt' };
    const hash = sourceQueryHash(query);
    await repo.save(1, hash, [candidate], new AbortController().signal);
    await prisma.achievement.create({ data: { id: 2, appId: 220, apiName: 'B', name: 'Second' } });
    await repo.save(2, 'second', [{ ...candidate, excerpt: 'Second achievement excerpt' }], new AbortController().signal);
    expect(await prisma.externalSource.count()).toBe(1);
    expect((await repo.cached(1, hash, new Date(0)))[0].excerpt).toBe(candidate.excerpt);
    expect(await repo.cached(1, sourceQueryHash({ ...query, name: 'Changed' }), new Date(0))).toEqual([]);
  });
  it('neradus aktualaus turinio grąžina tuščią rezultatą; tinklo sutrikimą atskiria', async () => {
    const repo = createSourcesRepo(prisma);
    expect(await createSourcesService(repo, { get: vi.fn().mockResolvedValue('<p>No results</p>') }).collect(query, new AbortController().signal)).toEqual([]);
    await expect(createSourcesService(repo, { get: vi.fn().mockRejectedValue(new Error('offline')) }).collect(query, new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCES_UNAVAILABLE' });
    expect(await prisma.sourceExcerpt.count()).toBe(0);
  });
});
