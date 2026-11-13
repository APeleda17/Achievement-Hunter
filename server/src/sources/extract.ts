import { load } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { SourceCandidate, SourceQuery } from './types.js';

export const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/['’]/g, '')
  .replace(/\b(?:lvl|lv)\.?\s*(?=\d)/g, 'level ').replace(/\b(level|ante)(\d+)/g, '$1 $2')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const plain = (value: string) => value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const includes = (text: string, phrase: string) => !!phrase && ` ${normalized(text)} `.includes(` ${phrase} `);
const cap = (text: string) => {
  const characters = [...text];
  if (characters.length <= 4000) return text;
  const gap = '\n[Excerpt gap]\n';
  return characters.slice(0, 2300).join('') + gap + characters.slice(-(4000 - 2300 - gap.length)).join('');
};

// Community guides contain small spelling mistakes (e.g. Ressurected). Restrict
// fuzzy matching to short heading-like lines; never fuzzy-match body paragraphs.
function similarHeading(line: string, name: string): boolean {
  const text = normalized(line).replace(/^(?:achievement )?\d+ /, '');
  if (name.length < 12 || Math.abs(text.length - name.length) > 2 || text.length > 100) return false;
  let previous = Array.from({ length: name.length + 1 }, (_, i) => i);
  for (let i = 1; i <= text.length; i++) {
    const row = [i];
    for (let j = 1; j <= name.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (text[i - 1] === name[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[name.length] <= 2;
}

export interface GuideDocument {
  title: string;
  appId: number | null;
  type: 'WIKI' | 'STEAM_GUIDE';
  sections: { title: string; lines: string[] }[];
}

// Steam keeps achievement headings outside .subSectionDesc. Preserve each heading
// with its body, including boundaries inside long multi-achievement sections.
export function parseGuide(html: string, url: string): GuideDocument {
  const $ = load(html);
  const steam = new URL(url).hostname === 'steamcommunity.com';
  const appLink = $('a.apphub_sectionTab[href]').toArray().map((e) => $(e).attr('href')!).find((href) => /^https:\/\/steamcommunity\.com\/app\/\d+\/guides\/?(?:\?|$)/.test(href));
  const appId = appLink ? Number(appLink.match(/\/app\/(\d+)\//)![1]) : null;
  const title = plain((steam ? $('.workshopItemTitle').first().text() : $('#firstHeading').first().text()) || $('title').text()).slice(0, 300);
  $('script,style,nav,header,footer,form,iframe,noscript,.toc,.mw-editsection,.commentthread_area').remove();
  const roots = steam ? ($('.subSection').has('.subSectionDesc').length ? $('.subSection').has('.subSectionDesc') : $('.subSectionDesc'))
    : ($('#mw-content-text .mw-parser-output').length ? $('#mw-content-text .mw-parser-output').first() : $('#mw-content-text').first());
  const sections = roots.toArray().map((node) => {
    const root = $(node);
    const heading = steam ? plain(root.find('.subSectionTitle').first().text()) : '';
    const body = root.find('.subSectionDesc').length ? root.find('.subSectionDesc').first() : root;
    const marked = new Set<object>();
    body.find('b,strong,u').each((_i, element) => {
      let label = $(element);
      const text = plain(label.text());
      if (text.length < 4 || text.length > 100) return;
      while (label.parent().is('b,strong,u,i,em,span,a') && plain(label.parent().text()) === text) label = label.parent();
      const node = label.get(0)!;
      if (marked.has(node) || label.parents('h1,h2,h3,h4,.bb_h1,.bb_h2,.bb_h3').length) return;
      const edge = (sibling: AnyNode | null, direction: 'prev' | 'next') => {
        while (sibling?.type === 'text' && !sibling.data.trim()) sibling = sibling[direction];
        return !sibling || (sibling.type === 'tag' && ['br', 'p', 'div', 'li'].includes(sibling.name));
      };
      if (edge(node.prev, 'prev') && edge(node.next, 'next')) {
        marked.add(node);
        label.before('\n@@BOUNDARY@@\n').after('\n');
      }
    });
    body.find('br').replaceWith('\n');
    body.find('h1,h2,h3,h4,tr,.bb_table_tr,.bb_h1,.bb_h2,.bb_h3').each((_i, e) => { $(e).prepend('\n@@BOUNDARY@@\n'); });
    body.find('p,li,tr,.bb_table_tr,h1,h2,h3,h4,.bb_h1,.bb_h2,.bb_h3,blockquote').each((_i, e) => { $(e).prepend('\n').append('\n'); });
    body.find('td,th,.bb_table_td,.bb_table_th,b,strong,u').each((_i, e) => { $(e).append(' '); });
    return { title: heading, lines: plain(body.text()).split('\n').map((line) => line.trim()).filter(Boolean) };
  });
  return { title, appId, type: steam ? 'STEAM_GUIDE' : 'WIKI', sections };
}

export function extractFromDocument(document: GuideDocument, url: string, query: SourceQuery): SourceCandidate | null {
  if (document.type === 'STEAM_GUIDE' && document.appId !== query.appId) return null;
  const name = normalized(query.name);
  const description = normalized(query.description);
  if (!name) return null;
  const conditionMatch = (line: string) => description.length >= 10 && includes(line, description);
  const matches = (line: string) => {
    const text = normalized(line);
    const nameMatch = includes(line, name) && (name.includes(' ') || text === name || text.startsWith(name + ' '));
    return nameMatch || similarHeading(line, name) || conditionMatch(line);
  };
  const otherNames = (query.achievementNames ?? []).map(normalized).filter((other) => other && other !== name);
  const otherAchievement = (line: string) => {
    if (line.length > 160) return false;
    const text = normalized(line).replace(/^(?:[a-z] \d+ |(?:achievement )?\d+ )/, '');
    return otherNames.some((other) => text === other || similarHeading(text, other)
      || (text.startsWith(other + ' ') && (text.length - other.length < 40 || /\s[-–—:]\s/.test(line))));
  };
  const candidates: { text: string; score: number }[] = [];
  const informative = (text: string) => {
    const remainder = normalized(text).replace(name, '').replace(description, '').trim();
    // A verified community guide can legitimately confirm a simple condition in
    // one sentence. Do not demand invented extra actions just to lengthen it.
    if (conditionMatch(text)) return true;
    return remainder.length >= 20 && remainder.split(' ').length >= 4
      && !/^(?:https? |watch (?:the )?video|youtube |achievement unlocked)/i.test(remainder);
  };
  for (const section of document.sections) {
    if (matches(section.title)) {
      const end = section.lines.findIndex(otherAchievement);
      const text = cap([section.title, ...section.lines.slice(0, end < 0 ? undefined : end).filter((line) => line !== '@@BOUNDARY@@')].join('\n'));
      if (informative(text)) candidates.push({ text, score: (normalized(section.title) === name ? 100 : 80) + (conditionMatch(text) ? 100 : 0) });
    }
    const lines = [section.title, ...section.lines].filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (!matches(lines[i]) || lines[i].length > 800) continue;
      const selected = [lines[i]];
      for (let j = i + 1; j < lines.length && selected.join('\n').length < 4000; j++) {
        const line = lines[j];
        if (line === '@@BOUNDARY@@') {
          const next = lines[j + 1] ?? '';
          if (!otherAchievement(next) && (selected.length === 1 || normalized(next) === description || /^(?:note|tip|warning|missable|unmissable|story related)\b/i.test(next))) continue;
          break;
        }
        if (otherAchievement(line) || /^(?:achievement\s*#?\d+\s*[–—:-]|chapter\s*#?\d+|lambda cache\s*#?\d+)/i.test(line)) break;
        selected.push(line);
      }
      const text = cap(selected.join('\n'));
      if (informative(text)) candidates.push({ text, score: (normalized(lines[i]) === name ? 70 : 50) + (conditionMatch(text) ? 100 : 0) });
    }
  }
  // A dedicated guide may put the achievement name only in its page title.
  if (includes(document.title, name) && name.length >= 8) {
    const text = cap(document.sections.flatMap((section) => [section.title, ...section.lines.filter((line) => line !== '@@BOUNDARY@@')]).join('\n'));
    if (informative(text)) candidates.push({ text, score: 60 });
  }
  // Single-achievement guides sometimes separate the condition from instructions.
  for (let i = 0; i + 1 < document.sections.length; i++) {
    const section = document.sections[i];
    const next = document.sections[i + 1];
    if (section.lines.some(matches) && !section.lines.some(otherAchievement) && /^(?:steps(?: to follow)?|how to (?:unlock|obtain|get)|walkthrough|solution|instructions)$/i.test(next.title.trim())) {
      const text = cap([query.name, ...section.lines, next.title, ...next.lines].filter((line) => line !== '@@BOUNDARY@@').join('\n'));
      if (informative(text)) candidates.push({ text, score: 250 });
    }
  }
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best ? { url, title: document.title || query.gameName, type: document.type, excerpt: best.text } : null;
}

export function extractRelevant(html: string, url: string, query: SourceQuery): SourceCandidate | null {
  return extractFromDocument(parseGuide(html, url), url, query);
}

export function steamGuideLinks(html: string, achievementName = '', max = 12): string[] {
  const $ = load(html);
  const entries = new Map<string, { score: number; position: number }>();
  $('a[href]').each((position, node) => {
    try {
      const anchor = $(node);
      const url = new URL(anchor.attr('href')!, 'https://steamcommunity.com');
      if (url.origin !== 'https://steamcommunity.com' || !/^\/sharedfiles\/filedetails\/?$/.test(url.pathname) || !/^\d+$/.test(url.searchParams.get('id') ?? '')) return;
      const title = plain(anchor.find('.workshopItemTitle').text() || anchor.text());
      if (/achievement manager|\bSAM\b|unlock all.*(?:tool|cheat)|save ?(?:file|game) download|buy.*achievement/i.test(title)) return;
      const description = anchor.find('.workshopItemShortDesc').text();
      const score = (achievementName && includes(title, normalized(achievementName)) ? 100 : 0)
        + (/100\s*%|complete|all achievements|full achievement/i.test(title) ? 40 : 0)
        + (/achievement|walkthrough|troph/i.test(title) ? 20 : 0) + (/all.*achievement|complete.*achievement/i.test(description) ? 10 : 0);
      const canonical = `https://steamcommunity.com/sharedfiles/filedetails/?id=${url.searchParams.get('id')}`;
      if (!entries.has(canonical)) entries.set(canonical, { score: Number(score), position });
    } catch { /* foreign or malformed link */ }
  });
  return [...entries].sort((a, b) => b[1].score - a[1].score || a[1].position - b[1].position).slice(0, max).map(([url]) => url);
}
