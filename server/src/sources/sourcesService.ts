import pLimit from 'p-limit';
import { AppError } from '../errors.js';
import type { SourcesRepo } from '../db/sourcesRepo.js';
import { createSourceHttp, SourceReadError, type SourceHttp } from './sourceHttp.js';
import { extractFromDocument, parseGuide, steamGuideLinks, type GuideDocument } from './extract.js';
import { allowedSourceUrl, EDITION_LABELS, GUIDE_EDITIONS, WIKI_PAGES } from './registry.js';
import { sourceQueryHash, SOURCE_TTL_MS, type SourceCandidate, type SourcesCollector } from './types.js';

// Transient parsed indexes only, never complete source HTML in PostgreSQL.
// A game with 500 achievements must not download the same guide 500 times.
function cache<T>(maxEntries: number, ttl: number, maxWeight = Infinity, weight: (value: T) => number = () => 1) {
  const entries = new Map<string, { value: T; until: number; weight: number }>();
  let total = 0;
  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      if (entry.until <= Date.now()) { total -= entry.weight; return undefined; }
      entries.set(key, entry);
      return entry.value;
    },
    set(key: string, value: T) {
      const previous = entries.get(key);
      if (previous) { total -= previous.weight; entries.delete(key); }
      const size = weight(value);
      if (size > maxWeight) return;
      entries.set(key, { value, until: Date.now() + ttl, weight: size });
      total += size;
      while (entries.size > maxEntries || total > maxWeight) {
        const oldest = entries.keys().next().value!;
        total -= entries.get(oldest)!.weight;
        entries.delete(oldest);
      }
    },
  };
}

export function createSourcesService(repo: SourcesRepo, http: SourceHttp = createSourceHttp(), options: { budgetMs?: number } = {}): SourcesCollector {
  const limit = pLimit(2);
  const documents = cache<{ document: GuideDocument; fetchedAt: Date }>(40, 15 * 60_000, 6_000_000, ({ document: doc }) => doc.sections.reduce((n, section) => n + section.title.length + section.lines.join('\n').length, 0) * 2);
  const listings = cache<string[]>(64, 10 * 60_000);
  const knownGuides = cache<string[]>(100, 15 * 60_000);
  return {
    async collect(query, parent) {
      parent.throwIfAborted();
      const hash = sourceQueryHash(query);
      const cached = (await repo.cached(query.achievementId, hash, new Date(Date.now() - SOURCE_TTL_MS))).filter((source) => allowedSourceUrl(source.url));
      if (cached.length) return cached;
      const controller = new AbortController();
      const abort = () => controller.abort();
      parent.addEventListener('abort', abort, { once: true });
      if (parent.aborted) abort();
      // Leave room for Ollama's full 90 s inside the shared 120 s job deadline.
      const timer = setTimeout(abort, Math.min(options.budgetMs ?? 22_000, 22_000));
      const signal = controller.signal;
      const candidates = new Map<string, SourceCandidate>();
      const visited = new Set<string>();
      let usablePages = 0;
      let networkFailures = 0;
      let scanned = 0;
      let throttled = false;
      let hadRateLimit = false;
      const editions = GUIDE_EDITIONS[query.appId] ?? [];
      const allowedGames = new Set([query.appId, ...editions.map((edition) => edition.appId)]);
      const primaryAppId = editions.find((edition) => edition.prefer)?.appId ?? query.appId;

      const failure = (error: unknown) => {
        if (parent.aborted) parent.throwIfAborted();
        if (error instanceof SourceReadError && error.code === 'RATE_LIMITED') {
          hadRateLimit = true;
          if (error.scope !== 'resource') throttled = true;
          networkFailures++;
        }
        if (!(error instanceof SourceReadError) || error.code === 'UNAVAILABLE') networkFailures++;
      };
      async function page(url: string) {
        if (visited.has(url) || signal.aborted || !allowedSourceUrl(url)) return;
        visited.add(url);
        try {
          let entry = documents.get(url);
          if (!entry) {
            const html = await limit(async () => { signal.throwIfAborted(); return http.get(url, signal); });
            signal.throwIfAborted();
            entry = { document: parseGuide(html, url), fetchedAt: new Date() };
            // Do not cache empty/error/age-warning pages as if they were guides.
            if (entry.document.sections.length) documents.set(url, entry);
          }
          const sourceAppId = entry.document.appId;
          if (entry.document.type === 'STEAM_GUIDE' && (sourceAppId === null || !allowedGames.has(sourceAppId))) return;
          if (entry.document.sections.length) usablePages++;
          const item = extractFromDocument(entry.document, url, { ...query, appId: sourceAppId ?? query.appId });
          if (item && sourceAppId && EDITION_LABELS[sourceAppId]) item.title += ` [${EDITION_LABELS[sourceAppId]}]`;
          if (item) candidates.set(url, { ...item, fetchedAt: entry.fetchedAt });
        } catch (error) { failure(error); }
      }
      async function scan(urls: string[], max = 12) {
        const fresh = urls.filter((url) => !visited.has(url)).slice(0, Math.min(max, Math.max(0, 24 - scanned)));
        for (let i = 0; i < fresh.length && !signal.aborted && !throttled && !candidates.size; i += 2) {
          scanned += Math.min(2, fresh.length - i);
          await Promise.all(fresh.slice(i, i + 2).map(page));
        }
      }
      async function search(searchText: string, category = false, appId = query.appId) {
        const listing = new URL(`https://steamcommunity.com/app/${appId}/guides/`);
        const params = new URLSearchParams({ searchText, browsefilter: 'toprated', l: 'english', numperpage: '30' });
        params.append('requiredtags[]', 'English');
        if (category) params.append('requiredtags[]', 'Achievements');
        listing.search = params.toString();
        try {
          let links = listings.get(listing.href);
          if (!links) {
            const html = await limit(async () => { signal.throwIfAborted(); return http.get(listing.href, signal); });
            signal.throwIfAborted();
            if (/class=["'][^"']*\bcontentcheck_header\b/i.test(html)) throw new SourceReadError('UNAVAILABLE');
            links = steamGuideLinks(html, query.name, 12);
            // Failed requests and consent/error pages are never negative-cached.
            if (links.length) listings.set(listing.href, links);
          }
          await scan(links, 6);
        } catch (error) { failure(error); }
      }
      try {
        await scan(knownGuides.get(String(query.appId)) ?? []);
        if (!candidates.size) await Promise.all([
          Promise.all((WIKI_PAGES[query.appId] ?? []).map(page)),
          search('', true, primaryAppId),
        ]);
        if (!candidates.size && !signal.aborted && !throttled) await search(query.name);
        if (!candidates.size && !signal.aborted && !throttled) await search('achievement');
        if (!candidates.size && !signal.aborted && !throttled) await search('');
        for (const edition of editions) {
          if (candidates.size || signal.aborted || throttled) break;
          await search('', true, edition.appId);
          if (!candidates.size && !signal.aborted && !throttled) await search('achievement', false, edition.appId);
        }
        parent.throwIfAborted();
        const found = [...candidates.values()].slice(0, 3);
        if (!found.length && (signal.aborted || hadRateLimit || (!usablePages && networkFailures))) throw new AppError(503, 'SOURCES_UNAVAILABLE');
        if (!found.length) return [];
        const steam = found.filter((source) => source.type === 'STEAM_GUIDE').map((source) => source.url);
        if (steam.length) knownGuides.set(String(query.appId), [...new Set([...steam, ...(knownGuides.get(String(query.appId)) ?? [])])].slice(0, 12));
        // The search budget may expire after collecting useful pages. Save those
        // with the parent signal, which still protects against a late job write.
        return repo.save(query.achievementId, hash, found, parent);
      } finally { clearTimeout(timer); parent.removeEventListener('abort', abort); }
    },
  };
}
