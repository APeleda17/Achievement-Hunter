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
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_JOB_TIMEOUT'
  | 'AI_QUEUE_FULL'
  | 'NO_DESCRIPTION'
  | 'NO_RELIABLE_INFO'
  | 'SOURCES_UNAVAILABLE'
  | 'SOURCE_CHANGED'
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
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR' } });
    return;
  }
  console.error('[klaida]', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
};
