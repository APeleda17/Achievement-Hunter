import type { ErrorRequestHandler } from 'express';

// Vidiniai klaidų kodai (API-05). Klientas pagal juos parenka lietuvišką pranešimą,
// todėl techninės detalės naudotojui nerodomos.
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'AUTH_FAILED'
  | 'PROFILE_PRIVATE'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'STEAM_UNAVAILABLE'
  | 'SYNC_IN_PROGRESS'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message?: string,
    // Papildomi laukai atsakyme, pvz. { hasCachedData: true } (ATN-04)
    public readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

// Bendras klaidų apdorojimas: atsakymas visada { error: { code, ... } }.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, ...err.details } });
    return;
  }
  console.error('[klaida]', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
};
