import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { allowedSourceUrl } from './registry.js';

export class SourceReadError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'NOT_FOUND' | 'POLICY' | 'TOO_LARGE' | 'RATE_LIMITED',
    public readonly scope: 'host' | 'resource' = 'host') { super(code); }
}
// Use Node fetch's native client identification consistently for HTTP and robots.
const AGENT = 'node';
const MAX_BYTES = 2_000_000;
// robots-parser is CommonJS; its published ambient declaration is incompatible with NodeNext.
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, text: string) => {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
};
export function createSourceHttp(options: { fetch?: typeof fetch; timeoutMs?: number; now?: () => number } = {}) {
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const policies = new Map<string, { parser: ReturnType<typeof robotsParser>; expires: number }>();
  const nextRequest = new Map<string, number>();
  const cooldown = new Map<string, number>();
  const resourceCooldown = new Map<string, number>();
  const slowUntil = new Map<string, number>();

  async function raw(url: URL, parent: AbortSignal) {
    if (!allowedSourceUrl(url.href)) throw new SourceReadError('POLICY');
    if ((cooldown.get(url.origin) ?? 0) > now()) throw new SourceReadError('RATE_LIMITED');
    if ((resourceCooldown.get(url.href) ?? 0) > now()) throw new SourceReadError('RATE_LIMITED', 'resource');
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent.addEventListener('abort', abort, { once: true });
    if (parent.aborted) abort();
    const timer = setTimeout(abort, Math.min(options.timeoutMs ?? 10_000, 10_000));
    try {
      controller.signal.throwIfAborted();
      const response = await send(url, { redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'text/html,text/plain;q=0.9' } });
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const until = header && /^\d+$/.test(header) ? now() + Number(header) * 1000 : header ? Date.parse(header) : NaN;
        if (header) cooldown.set(url.origin, Number.isFinite(until) ? Math.max(now() + 1000, until) : now() + 60_000);
        else {
          // 429 may be scoped to one resource. Without Retry-After, do not turn
          // one inaccessible guide into an outage for every other game. Stop
          // retrying that resource and slow down the host for the next minute.
          resourceCooldown.set(url.href, now() + 60_000);
          slowUntil.set(url.origin, now() + 60_000);
          nextRequest.set(url.origin, Math.max(nextRequest.get(url.origin) ?? 0, now() + 2000));
        }
        await response.body?.cancel();
        throw new SourceReadError('RATE_LIMITED', header ? 'host' : 'resource');
      }
      if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
        await response.body?.cancel();
        throw new SourceReadError('TOO_LARGE');
      }
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES) { await reader.cancel(); throw new SourceReadError('TOO_LARGE'); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
      }
      controller.signal.throwIfAborted();
      return { status: response.status, location: response.headers.get('location'), text: Buffer.concat(chunks).toString('utf8') };
    } catch (error) {
      if (error instanceof SourceReadError) throw error;
      throw new SourceReadError('UNAVAILABLE');
    } finally { clearTimeout(timer); parent.removeEventListener('abort', abort); }
  }

  async function policy(origin: string, signal: AbortSignal) {
    const cached = policies.get(origin);
    if (cached && cached.expires > now()) return cached.parser;
    const url = new URL('/robots.txt', origin);
    const response = await raw(url, signal);
    if (response.status !== 200 && response.status !== 404) throw new SourceReadError('POLICY');
    const parser = robotsParser(url.href, response.status === 404 ? '' : response.text);
    policies.set(origin, { parser, expires: now() + 24 * 60 * 60 * 1000 });
    return parser;
  }

  return {
    async get(value: string, signal: AbortSignal): Promise<string> {
      let url = new URL(value);
      for (let hop = 0; hop < 4; hop++) {
        if (url.hostname === 'steamcommunity.com' && url.pathname !== '/robots.txt') url.searchParams.set('l', 'english');
        if (!allowedSourceUrl(url.href)) throw new SourceReadError('POLICY');
        if ((cooldown.get(url.origin) ?? 0) > now()) throw new SourceReadError('RATE_LIMITED');
        if ((resourceCooldown.get(url.href) ?? 0) > now()) throw new SourceReadError('RATE_LIMITED', 'resource');
        const rules = await policy(url.origin, signal);
        if (rules.isAllowed(url.href, AGENT) === false) throw new SourceReadError('POLICY');
        const wait = Math.max(0, (nextRequest.get(url.origin) ?? 0) - now());
        const spacing = Math.max((slowUntil.get(url.origin) ?? 0) > now() ? 2000 : 1000, (rules.getCrawlDelay(AGENT) ?? 0) * 1000);
        nextRequest.set(url.origin, now() + wait + spacing);
        if (wait) await delay(wait, undefined, { signal });
        signal.throwIfAborted();
        const response = await raw(url, signal);
        if (response.status >= 300 && response.status < 400 && response.location) {
          url = new URL(response.location, url);
          continue; // ir nukreipimo adresui iš naujo tikrinamas sąrašas bei robots.txt
        }
        if (response.status === 404) throw new SourceReadError('NOT_FOUND');
        if (response.status !== 200) throw new SourceReadError('UNAVAILABLE');
        return response.text;
      }
      throw new SourceReadError('POLICY');
    },
  };
}
export type SourceHttp = ReturnType<typeof createSourceHttp>;
