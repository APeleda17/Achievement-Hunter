import 'dotenv/config';

/** Testinės DB adresas. Testai NIEKADA nenaudoja kūrimo DB (achievement_hunter). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://achievement:achievement@localhost:5432/achievement_hunter_test';

if (!TEST_DATABASE_URL.includes('_test')) {
  throw new Error('TEST_DATABASE_URL turi rodyti į testinę DB (pavadinime turi būti „_test“)');
}
