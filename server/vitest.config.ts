import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    // Prieš visus testus – migracijos testinei DB
    globalSetup: ['tests/globalSetup.ts'],
    // Prieš kiekvieną testų failą – DATABASE_URL nukreipiamas į testinę DB
    setupFiles: ['tests/setup.ts'],
    // Visi failai naudoja tą pačią testinę DB, todėl vykdomi paeiliui
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
