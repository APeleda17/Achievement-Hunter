import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../auth/requireAuth.js';
import { AppError } from '../errors.js';
import type { LibraryService } from './libraryService.js';
import type { SyncService } from '../sync/syncService.js';

const searchQuery = z.object({
  search: z.string().trim().max(200).optional(),
});

// Endpointai montuojami po /api, todėl requireAuth jau patikrintas (API-02).
export function createLibraryRouter(library: LibraryService, sync: SyncService) {
  const router = Router();

  // FR-05, FR-06: žaidimų sąrašas su paieška
  router.get('/games', async (req, res, next) => {
    try {
      const parsed = searchQuery.safeParse(req.query);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR');
      res.json(await library.getLibrary(currentUserId(req), parsed.data.search || undefined));
    } catch (err) {
      next(err);
    }
  });

  // FR-10: „Atnaujinti“ – visa biblioteka; atsakyme – atnaujintas sąrašas
  router.post('/sync', async (req, res, next) => {
    try {
      const userId = currentUserId(req);
      await sync.syncLibrary(userId, { withAchievements: true });
      res.json(await library.getLibrary(userId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
