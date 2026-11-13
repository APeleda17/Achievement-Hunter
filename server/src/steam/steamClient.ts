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

/** Steam atsisakė pateikti duomenis, nes profilis ar „Game details“ privatūs (FR-04). */
export class SteamPrivateProfileError extends Error {
  constructor() {
    super('Steam profilis arba žaidimų duomenys privatūs');
    this.name = 'SteamPrivateProfileError';
  }
}

export interface PlayerSummary {
  steamId: string;
  personaName: string;
  avatarUrl: string | null;
  /** communityvisibilitystate === 3 (FR-04) */
  profilePublic: boolean;
}

export interface OwnedGame {
  appId: number;
  name: string;
  iconUrl: string | null;
  playtimeMinutes: number;
}

export interface SchemaAchievement {
  apiName: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
}

export interface PlayerAchievement {
  apiName: string;
  achieved: boolean;
  /** null, jei neatrakintas */
  unlockedAt: Date | null;
}

/** Sąsaja, kad testuose klientą būtų galima pakeisti mock'u. */
export interface SteamClient {
  getPlayerSummary(steamId: string): Promise<PlayerSummary | null>;
  /** null – Steam grąžino tuščią atsaką (privatūs „Game details“) */
  getOwnedGames(steamId: string): Promise<OwnedGame[] | null>;
  /** Tuščias masyvas – žaidimas neturi pasiekimų */
  getSchemaForGame(appId: number): Promise<SchemaAchievement[]>;
  /** null – „Requested app has no stats“ */
  getPlayerAchievements(steamId: string, appId: number): Promise<PlayerAchievement[] | null>;
    /** SDG-05: visų žaidėjų atrakinimo procentas, apiName → 0–100. Tuščias – žaidimas be statistikos. */
  getGlobalAchievementPercentages(appId: number): Promise<Map<string, number>>;
}

// ---- Steam atsakymų schemos (SDG-04) ----

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

const ownedGamesSchema = z.object({
  response: z.object({
    game_count: z.number().optional(),
    games: z
      .array(
        z.object({
          appid: z.number().int().nonnegative(),
          name: z.string().optional(),
          playtime_forever: z.number().default(0),
          img_icon_url: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

const schemaForGameSchema = z.object({
  game: z
    .object({
      availableGameStats: z
        .object({
          achievements: z
            .array(
              z.object({
                name: z.string(),
                displayName: z.string(),
                description: z.string().optional(),
                icon: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const playerAchievementsSchema = z.object({
  playerstats: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    achievements: z
      .array(
        z.object({
          apiname: z.string(),
          achieved: z.number(),
          unlocktime: z.number(),
        }),
      )
      .optional(),
  }),
});

// Steam procentą kartais grąžina skaičiumi, kartais eilute ("12.3"), todėl abu variantai priimami
const globalPercentagesSchema = z.object({
  achievementpercentages: z.object({
    achievements: z
      .array(
        z.object({
          name: z.string(),
          percent: z.coerce.number().min(0).max(100),
        }),
      )
      .optional(),
  }),
});

function gameIconUrl(appId: number, hash: string | undefined): string | null {
  if (!hash) return null;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
}

export function createSteamClient(apiKey: string): SteamClient {
  /**
   * Vienas Steam kvietimas: 10 s laukimo riba ir vienas pakartojimas gavus 429 / 5xx (SDG-03),
   * atsakymas tikrinamas pagal zod schemą (SDG-04).
   * `parseStatuses` – HTTP kodai (pvz. 400, 403), kurių atsakymą Steam grąžina su paaiškinimu JSON'e.
   */
  async function call<S extends z.ZodTypeAny>(
    method: string,
    path: string,
    params: Record<string, string>,
    schema: S,
    parseStatuses: number[] = [],
  ): Promise<{ status: number; data: z.output<S> }> {
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
      if (!response.ok && !parseStatuses.includes(response.status)) {
        throw new SteamUnavailableError(`${method}: HTTP ${response.status}`);
      }

      const parsed = schema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new SteamUnavailableError(`${method}: netinkamas atsakymo formatas`);
      }
      return { status: response.status, data: parsed.data };
    }
    throw new SteamUnavailableError(`${method}: nepavyko`);
  }

  return {
    async getPlayerSummary(steamId) {
      const { data } = await call(
        'GetPlayerSummaries',
        'ISteamUser/GetPlayerSummaries/v2/',
        { steamids: steamId },
        playerSummariesSchema,
      );
      const player = data.response.players[0];
      if (!player) return null;
      return {
        steamId: player.steamid,
        personaName: player.personaname,
        avatarUrl: player.avatarfull ?? null,
        profilePublic: player.communityvisibilitystate === 3,
      };
    },

    async getOwnedGames(steamId) {
      const { data } = await call(
        'GetOwnedGames',
        'IPlayerService/GetOwnedGames/v1/',
        { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' },
        ownedGamesSchema,
      );
      // Privatūs „Game details“ – Steam grąžina tiesiog { response: {} } (FR-04)
      if (data.response.games === undefined && data.response.game_count === undefined) return null;
      return (data.response.games ?? []).map((g) => ({
        appId: g.appid,
        name: g.name ?? `App ${g.appid}`,
        iconUrl: gameIconUrl(g.appid, g.img_icon_url),
        playtimeMinutes: g.playtime_forever,
      }));
    },

    async getSchemaForGame(appId) {
      // 400 – kai kurie žaidimai be statistikos grąžina klaidą vietoj tuščio sąrašo
      const { status, data } = await call(
        'GetSchemaForGame',
        'ISteamUserStats/GetSchemaForGame/v2/',
        { appid: String(appId), l: 'english' },
        schemaForGameSchema.catch({}),
        [400],
      );
      if (status === 400) return [];
      return (data.game?.availableGameStats?.achievements ?? []).map((a) => ({
        apiName: a.name,
        name: a.displayName,
        description: a.description || null,
        iconUrl: a.icon ?? null,
      }));
    },

    async getPlayerAchievements(steamId, appId) {
      const { status, data } = await call(
        'GetPlayerAchievements',
        'ISteamUserStats/GetPlayerAchievements/v1/',
        { steamid: steamId, appid: String(appId) },
        playerAchievementsSchema,
        [400, 403],
      );
      if (status === 403) throw new SteamPrivateProfileError();
      if (!data.playerstats.success) {
        // „Requested app has no stats“ – žaidimas neturi pasiekimų (FR-09)
        if (/no stats/i.test(data.playerstats.error ?? '')) return null;
        throw new SteamUnavailableError(`GetPlayerAchievements: ${data.playerstats.error ?? 'nežinoma klaida'}`);
      }
      return (data.playerstats.achievements ?? []).map((a) => ({
        apiName: a.apiname,
        achieved: a.achieved === 1,
        unlockedAt: a.achieved === 1 && a.unlocktime > 0 ? new Date(a.unlocktime * 1000) : null,
      }));
    },
    
    async getGlobalAchievementPercentages(appId) {
      // 400 / 403 / 404 – žaidimas neturi viešos pasiekimų statistikos
      const { status, data } = await call(
        'GetGlobalAchievementPercentagesForApp',
        'ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
        { gameid: String(appId) },
        globalPercentagesSchema.catch({ achievementpercentages: {} }),
        [400, 403, 404],
      );
      if (status !== 200) return new Map();
      return new Map((data.achievementpercentages.achievements ?? []).map((a) => [a.name, a.percent]));
    },
  };
}
