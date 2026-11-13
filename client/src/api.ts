import type { AiJob, ExplainResponse, GameAchievements, Guide, GuideResponse, HelpAnswer, HelpResponse, Library, Me } from './types';

// Visos užklausos eina į tą patį adresą (Vite proxy → :3000), todėl sesijos slapukas
// siunčiamas automatiškai. Steam API raktas naršyklėje niekada nenaudojamas.

/** Serverio klaida su vidiniu kodu (UNAUTHORIZED, STEAM_UNAVAILABLE, …). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }

  /** Ar serveris turi anksčiau išsaugotų duomenų (FR-12 / FR-13). */
  get hasCachedData(): boolean {
    return this.details.hasCachedData === true;
  }
}

async function request<T>(method: 'GET' | 'POST', url: string, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method, credentials: 'same-origin', signal: options.signal,
      headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const { code = 'INTERNAL_ERROR', ...details } = body?.error ?? {};
    throw new ApiError(response.status, code, details);
  }
  return body as T;
}

export const api = {
  getMe: () => request<Me>('GET', '/api/me'),
  logout: () => request<void>('POST', '/auth/logout'),
  getLibrary: (search: string) =>
    request<Library>('GET', `/api/games${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  syncLibrary: () => request<Library>('POST', '/api/sync'),
  getAchievements: (appId: number) => request<GameAchievements>('GET', `/api/games/${appId}/achievements`),
  syncGame: (appId: number) => request<GameAchievements>('POST', `/api/games/${appId}/sync`),
  explain: (appId: number, apiName: string, signal?: AbortSignal) =>
    request<ExplainResponse>('POST', '/api/ai/explain', { body: { appId, apiName }, signal }),
  getAiJob: (id: string, signal?: AbortSignal) => request<AiJob>('GET', `/api/jobs/${encodeURIComponent(id)}`, { signal }),
  guide: (appId: number, apiName: string, signal?: AbortSignal) =>
    request<GuideResponse>('POST', '/api/ai/guide', { body: { appId, apiName }, signal }),
  getGuideJob: (id: string, signal?: AbortSignal) => request<AiJob<Guide>>('GET', `/api/jobs/${encodeURIComponent(id)}`, { signal }),
  help: (appId: number, apiName: string, problem: string, signal?: AbortSignal) =>
    request<HelpResponse>('POST', '/api/ai/help', { body: { appId, apiName, problem }, signal }),
  getHelpJob: (id: string, signal?: AbortSignal) => request<AiJob<HelpAnswer>>('GET', `/api/jobs/${encodeURIComponent(id)}`, { signal }),
  getHelpHistory: (appId: number, apiName: string, signal?: AbortSignal) =>
    request<{ requests: HelpAnswer[] }>('GET', `/api/ai/help?${new URLSearchParams({ appId: String(appId), apiName })}`, { signal }),
};
