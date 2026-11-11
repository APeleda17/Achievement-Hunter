import 'dotenv/config';
import { z } from 'zod';

// Visi nustatymai imami iš aplinkos kintamųjų (server/.env).
// Slapti raktai niekada nerašomi kode (NF-05, SDG-02).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  STEAM_API_KEY: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  DATABASE_URL: z.string().default(''),
});

export const config = envSchema.parse(process.env);
