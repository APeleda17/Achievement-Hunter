import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { SteamClient, PlayerSummary } from '../steam/steamClient.js';
import { buildSteamLoginUrl, verifySteamLogin } from './openid.js';
import { SESSION_COOKIE } from './session.js';
import { requireAuth, currentUserId } from './requireAuth.js';
import { findUserById, upsertUserBySteamId } from '../db/userRepo.js';
import { AppError } from '../errors.js';

interface AuthDeps {
  prisma: PrismaClient;
  steam: SteamClient;
  appUrl: string;
}

// AUT – prisijungimas, atsijungimas (NI-1).
export function createAuthRouter({ prisma, steam, appUrl }: AuthDeps) {
  const router = Router();
  // Grįžimas iš Steam eina per kliento adresą (Vite proxy), kad slapukas būtų tame pačiame domene
  const returnTo = `${appUrl}/auth/steam/return`;

  // FR-01: nukreipiame į Steam prisijungimo puslapį
  router.get('/auth/steam', (_req, res) => {
    res.redirect(buildSteamLoginUrl(returnTo, appUrl));
  });

  // FR-02: Steam grąžina naudotoją čia
  router.get('/auth/steam/return', async (req, res, next) => {
    try {
      const steamId = await verifySteamLogin(req.query, returnTo);
      if (!steamId) {
        console.warn('[auth] Steam prisijungimas nepatvirtintas');
        res.redirect(`${appUrl}/?klaida=AUTH_FAILED`);
        return;
      }

      // AUT-04: profilio duomenys. Jei Steam API nepasiekiamas – prisijungti vis tiek leidžiame.
      let profile: PlayerSummary | null = null;
      try {
        profile = await steam.getPlayerSummary(steamId);
      } catch (err) {
        console.warn('[auth] nepavyko gauti Steam profilio:', (err as Error).message);
      }

      const user = await upsertUserBySteamId(prisma, steamId, profile);

      // Nauja sesija po prisijungimo (apsauga nuo sesijos fiksavimo atakos)
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.steamId = user.steamId;
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          console.info(`[auth] prisijungė naudotojas id=${user.id}`);
          res.redirect(`${appUrl}/`);
        });
      });
    } catch (err) {
      next(err);
    }
  });

  // FR-03: atsijungimas – sesija sunaikinama DB ir išvalomas slapukas
  router.post('/auth/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE);
      res.status(204).end();
    });
  });

  // Prisijungusio naudotojo profilis + FR-04 požymis apie privatų profilį
  router.get('/api/me', requireAuth, async (req, res, next) => {
    try {
      const user = await findUserById(prisma, currentUserId(req));
      if (!user) throw new AppError(401, 'UNAUTHORIZED');
      res.json({
        steamId: user.steamId,
        personaName: user.personaName,
        avatarUrl: user.avatarUrl,
        profilePrivate: !user.profilePublic,
        lastLibrarySyncAt: user.lastLibrarySyncAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
