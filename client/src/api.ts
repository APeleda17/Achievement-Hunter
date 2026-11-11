import type { GameAchievements, Library, Me } from './types';

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

async function request<T>(method: 'GET' | 'POST', url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method, credentials: 'same-origin', headers: { Accept: 'application/json' } });
  } catch {
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
};
