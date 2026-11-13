// Tik serverio prižiūrimas sąrašas. Kliento pateikti URL niekada nepriimami.
export const WIKI_PAGES: Record<number, string[]> = {
  220: ['https://combineoverwiki.net/wiki/Half-Life_2_achievements'],
  400: ['https://theportalwiki.com/wiki/Obtaining_Portal_achievements'],
  620: ['https://theportalwiki.com/wiki/Obtaining_Portal_2_achievements'],
  440: ['https://wiki.teamfortress.com/wiki/Obtaining_achievements'],
  2379780: ['https://balatrowiki.org/Achievements'],
  1794680: ['https://vampire.survivors.wiki/w/Achievements'],
};

// A re-release has its own hub, while most existing achievement guides remain in
// the original hub. Only explicitly reviewed editions of THE SAME game may share
// guides; never guess a sequel/remaster from a similar name or accept client URLs.
export const GUIDE_EDITIONS: Record<number, { appId: number; name: string; prefer?: boolean }[]> = {
  3240220: [{ appId: 271590, name: 'Grand Theft Auto V Legacy', prefer: true }],
  271590: [{ appId: 3240220, name: 'Grand Theft Auto V Enhanced' }],
};
export const EDITION_LABELS: Record<number, string> = {
  271590: 'Grand Theft Auto V Legacy',
  3240220: 'Grand Theft Auto V Enhanced',
};
export const SOURCE_HOSTS = new Set(['steamcommunity.com', 'combineoverwiki.net', 'theportalwiki.com', 'wiki.teamfortress.com', 'balatrowiki.org', 'vampire.survivors.wiki']);
export function allowedSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !SOURCE_HOSTS.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (url.hostname === 'steamcommunity.com') {
      return url.pathname === '/robots.txt' || /^\/app\/\d+\/guides\/?$/.test(url.pathname)
        || (/^\/sharedfiles\/filedetails\/?$/.test(url.pathname) && /^\d+$/.test(url.searchParams.get('id') ?? ''));
    }
    if (url.hostname === 'balatrowiki.org') return url.pathname === '/robots.txt' || /^\/(?:w\/)?Achievements\/?$/.test(url.pathname);
    if (url.hostname === 'vampire.survivors.wiki') return url.pathname === '/robots.txt' || /^\/w\/Achievements\/?$/.test(url.pathname);
    return url.pathname === '/robots.txt' || (url.pathname.startsWith('/wiki/') && !/^\/wiki\/(Special|User|File|MediaWiki):/i.test(decodeURIComponent(url.pathname)));
  } catch { return false; }
}
