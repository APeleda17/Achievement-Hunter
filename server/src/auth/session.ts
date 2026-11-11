import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

// Sesijoje laikomi tik mūsų naudotojo id ir SteamID.
// Iš čia (ir tik iš čia) imamas userId visose /api užklausose (FR-14).
declare module 'express-session' {
  interface SessionData {
    userId: number;
    steamId: string;
  }
}

export const SESSION_COOKIE = 'ah.sid';

/** Sesijos saugomos PostgreSQL lentelėje „sesija“ (FR-02, AUT-05). */
export function createSessionMiddleware(opts: { databaseUrl: string; secret: string; production: boolean }) {
  const PgStore = connectPgSimple(session);

  return session({
    name: SESSION_COOKIE,
    store: new PgStore({ conString: opts.databaseUrl, tableName: 'sesija' }),
    secret: opts.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // JS naršyklėje slapuko neperskaito
      sameSite: 'lax',
      secure: opts.production, // localhost veikia per http, todėl Secure tik produkcijoje
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dienos
    },
  });
}
