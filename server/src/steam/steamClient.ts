import { z } from 'zod';

// SDG – „Steam“ duomenų gavimo komponentas.
// Tik šis modulis kreipiasi į Steam Web API. API raktas niekada nepatenka į atsakymus
// ar žurnalus (SDG-02, NF-12).

const STEAM_API = 'https://api.steampowered.com';
const TIMEOUT_MS = 10_000; // SDG-03

/** Steam nepasiekiamas: timeout, tinklo klaida, 5xx, netinkamas atsakymas ar nėra rakto. */
export class SteamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SteamUnavailableError';
  }
}

export interface PlayerSummary {
  steamId: string;
  personaName: string;
  avatarUrl: string | null;
  /** communityvisibilitystate === 3 (FR-04) */
  profilePublic: boolean;
}

/** Sąsaja, kad testuose klientą būtų galima pakeisti mock'u. */
export interface SteamClient {
  getPlayerSummary(steamId: string): Promise<PlayerSummary | null>;
}

const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        personaname: z.string(),
        avatarfull: z.string().optional(),
        communityvisibilitystate: z.number(),
      }),
    ),
  }),
});

export function createSteamClient(apiKey: string): SteamClient {
  /**
   * Vienas Steam kvietimas: 10 s laukimo riba ir vienas pakartojimas gavus 429 / 5xx (SDG-03),
   * atsakymas tikrinamas pagal zod schemą (SDG-04).
   */
  async function call<T>(method: string, path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    if (!apiKey) {
      throw new SteamUnavailableError('STEAM_API_KEY nenustatytas');
    }
    const url = new URL(`${STEAM_API}/${path}`);
    url.search = new URLSearchParams({ key: apiKey, format: 'json', ...params }).toString();

    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        // URL su raktu į žurnalą nerašomas – tik metodo pavadinimas
        throw new SteamUnavailableError(`${method}: tinklo klaida arba baigėsi laukimo laikas`);
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt === 1) continue;
      if (!response.ok) {
        throw new SteamUnavailableError(`${method}: HTTP ${response.status}`);
      }

      const parsed = schema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new SteamUnavailableError(`${method}: netinkamas atsakymo formatas`);
      }
      return parsed.data;
    }
    throw new SteamUnavailableError(`${method}: nepavyko`);
  }

  return {
    async getPlayerSummary(steamId) {
      const data = await call('GetPlayerSummaries', 'ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }, playerSummariesSchema);
      const player = data.response.players[0];
      if (!player) return null;
      return {
        steamId: player.steamid,
        personaName: player.personaname,
        avatarUrl: player.avatarfull ?? null,
        profilePublic: player.communityvisibilitystate === 3,
      };
    },
  };
}
