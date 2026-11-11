import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

/** Visi /api/* endpointai be sesijos grąžina 401 (FR-03, API-02). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) {
    next(new AppError(401, 'UNAUTHORIZED'));
    return;
  }
  next();
};

/** Prisijungusio naudotojo id – visada iš sesijos, niekada iš URL ar užklausos (FR-14). */
export function currentUserId(req: Parameters<RequestHandler>[0]): number {
  const userId = req.session.userId;
  if (!userId) throw new AppError(401, 'UNAUTHORIZED');
  return userId;
}
