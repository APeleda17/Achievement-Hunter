import 'dotenv/config';
import { z } from 'zod';

// Visi nustatymai imami iš aplinkos kintamųjų (server/.env).
// Slapti raktai niekada nerašomi kode (NF-05, SDG-02).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Kliento adresas. Per jį (Vite proxy) vyksta ir grįžimas iš Steam.
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Gali būti tuščias – tada Steam užklausos grąžins STEAM_UNAVAILABLE.
  STEAM_API_KEY: z.string().default(''),
  SESSION_SECRET: z.string().min(16, 'server/.env faile nustatykite SESSION_SECRET (bent 16 simbolių)'),
  DATABASE_URL: z.string().min(1, 'server/.env faile nustatykite DATABASE_URL'),
  // Ollama DI modelis (DIK-01, DIK-04). Numatytosios reikšmės tinka lokaliam darbui.
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().min(1).default('gemma4:e2b'),
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(4096),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
