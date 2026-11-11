import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './testDbUrl.js';

// Vykdoma vieną kartą prieš visus testus: pritaikomos migracijos testinei DB.
export default function setup() {
  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (err) {
    const output = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      'Nepavyko paruošti testinės DB. Ar paleistas PostgreSQL (docker compose up -d)?\n' + output,
    );
  }
}
