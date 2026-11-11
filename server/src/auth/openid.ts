// Steam OpenID 2.0 (AUT-01, AUT-02).
// Naudotojas įveda slaptažodį tik Steam puslapyje – mūsų sistema jo niekada nemato (FR-01).

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
// claimed_id formatas: https://steamcommunity.com/openid/id/76561198000000000
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** Adresas, į kurį nukreipiame naršyklę prisijungimui. */
export function buildSteamLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

/**
 * Patikrina Steam grąžintus parametrus ir paklausia pačio Steam, ar atsakymas tikras
 * (check_authentication). Grąžina 17 skaitmenų SteamID eilutę arba null.
 */
export async function verifySteamLogin(
  query: Record<string, unknown>,
  expectedReturnTo: string,
): Promise<string | null> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.') && typeof value === 'string') params[key] = value;
  }

  // Naudotojas atšaukė prisijungimą arba atsakymas ne iš Steam
  if (params['openid.mode'] !== 'id_res') return null;
  if (params['openid.op_endpoint'] !== STEAM_OPENID) return null;
  if (!params['openid.return_to']?.startsWith(expectedReturnTo)) return null;

  const match = CLAIMED_ID_RE.exec(params['openid.claimed_id'] ?? '');
  if (!match) return null;

  try {
    const response = await fetch(STEAM_OPENID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, 'openid.mode': 'check_authentication' }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!/is_valid\s*:\s*true/i.test(text)) return null;
  } catch {
    return null;
  }

  return match[1]!;
}
