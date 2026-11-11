import { vi } from 'vitest';
import { TEST_DATABASE_URL } from './testDbUrl.js';

// Serverio žurnalas ([sync], [auth]) testų išvestyje netrukdo – klaidos (console.error) lieka matomos
vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Vykdoma prieš kiekvieną testų failą, dar prieš importuojant programos kodą.
// dotenv esamų kintamųjų neperrašo, todėl čia nustatytos reikšmės lieka galioti.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET ||= 'testu-sesijos-paslaptis-tik-testams';
// Testuose tikras Steam niekada nekviečiamas – naudojamas mock'as
process.env.STEAM_API_KEY = '';
