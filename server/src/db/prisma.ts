import { PrismaClient } from '@prisma/client';

// Vienas Prisma klientas visai programai (DPK).
// Prisma visas užklausas vykdo parametrizuotai (DPK-02).
export const prisma = new PrismaClient();
