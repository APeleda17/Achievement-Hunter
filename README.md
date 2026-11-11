# Achievement Hunter

„Achievement Hunter“ – kompiuterinių žaidimų pasiekimų sekimo ir išmaniosios pagalbos sistema „Steam“ žaidėjams.
Vienoje vietoje matomi jūsų žaidimai, jų pasiekimai ir progresas.

VGTU kompleksinis projektas, PRIf-23/3 gr. (D. Butrimovičius, M. Rupeika, A. Pelėda).

> „Achievement Hunter“ nėra oficialus „Valve“ produktas. Duomenys gaunami per „Steam Web API“.

## 1 sprinto funkcionalumas

| NI | Funkcija | FR |
|---|---|---|
| NI-1 | Prisijungimas ir atsijungimas per „Steam“ (OpenID), privataus profilio pranešimas | FR-01–FR-04 |
| NI-6 | Žaidimų biblioteka su progresu ir paieška pagal pavadinimą | FR-05, FR-06 |
| NI-7 | Žaidimo pasiekimai: būsena, „X iš Y (Z,Z %)“, žaidimai be pasiekimų | FR-07–FR-09 |
| NI-8 | „Atnaujinti“ – duomenys iš „Steam“, paskutinio atnaujinimo laikas, apsauga nuo sutrikimų | FR-10–FR-13 |
| – | Naudotojas mato tik savo duomenis | FR-14 |

## Technologijos

- **Klientas** (`client/`): React 18 + TypeScript, Vite (dev serveris `:5173`)
- **Serveris** (`server/`): Node.js + Express + TypeScript (`:3000`)
- **DB**: PostgreSQL 16 (per Docker), Prisma ORM ir migracijos
- **Testai**: Vitest + supertest

## Reikalavimai

- [Node.js](https://nodejs.org/) 20 ar naujesnė versija (kartu įdiegiamas npm)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows – su WSL 2)
- Git

## Paleidimas lokaliai

Visos komandos vykdomos projekto šakniniame aplanke.

### 1. Parsisiųskite projektą ir įdiekite priklausomybes

```bash
git clone https://github.com/APeleda17/Achievement-Hunter.git
cd Achievement-Hunter
npm run install:all
```

`install:all` įdiegia priklausomybes šakniniame aplanke, `server/` ir `client/`.

### 2. Sukurkite konfigūracijos failą

```bash
cp .env.example server/.env
```

(Windows PowerShell: `Copy-Item .env.example server/.env`)

Atidarykite `server/.env` ir įrašykite:

| Kintamasis | Ką įrašyti |
|---|---|
| `STEAM_API_KEY` | „Steam Web API“ raktas (žr. žemiau). Be jo prisijungti galima, bet žaidimų duomenų gauti nepavyks |
| `SESSION_SECRET` | Ilga atsitiktinė eilutė. Sugeneruoti: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_URL`, `TEST_DATABASE_URL`, `APP_URL`, `PORT` | Palikite, kaip yra – reikšmės atitinka `docker-compose.yml` |

> `server/.env` yra `.gitignore` faile – **niekada jo necommitinkite**. Kiekvienas komandos narys turi savo raktą.

**Kaip gauti „Steam Web API“ raktą:**
1. Prisijunkite prie <https://steamcommunity.com/dev/apikey>.
2. Lauke „Domain Name“ įrašykite `localhost`, sutikite su sąlygomis ir paspauskite „Register“.
3. Nukopijuokite raktą į `server/.env` eilutę `STEAM_API_KEY=`.

### 3. Paleiskite duomenų bazę

Įsitikinkite, kad Docker Desktop veikia („Engine running“), tada:

```bash
docker compose up -d
```

Pirmą kartą sukuriamos dvi DB: `achievement_hunter` (kūrimui) ir `achievement_hunter_test` (testams).

### 4. Pritaikykite migracijas

```bash
cd server
npx prisma migrate deploy
cd ..
```

### 5. Paleiskite programą

```bash
npm run dev
```

Paleidžiami ir serveris (`:3000`), ir klientas (`:5173`). Atidarykite <http://localhost:5173>.
Sustabdyti – `Ctrl+C`.

### 6. Paleiskite testus

```bash
npm test
```

Testams reikia veikiančios DB (3 žingsnis). Testai naudoja **atskirą** DB `achievement_hunter_test`,
o „Steam“ juose pakeičiamas mock'u – raktas nereikalingas ir tikros užklausos nesiunčiamos.

## Kad matytumėte savo žaidimus

„Steam“ profilis turi būti viešas: **Profilis → Redaguoti profilį → Privatumo nustatymai**:
- „Mano profilis“ – **Viešas**
- „Žaidimo informacija“ („Game details“) – **Vieša**

Kitaip sistema parodys pranešimą su šiais žingsniais.

## Naudingos komandos

| Komanda | Ką daro |
|---|---|
| `npm run dev` | Paleidžia serverį ir klientą |
| `npm test` | Serverio testai |
| `npm run build` | Sukompiliuoja abi dalis |
| `docker compose up -d` / `docker compose down` | Paleidžia / sustabdo DB (duomenys išlieka) |
| `docker compose down -v` | Sustabdo DB ir **ištrina visus duomenis** |
| `cd server && npm run db:migrate` | Pakeitus `schema.prisma` – sukuria naują migraciją |
| `cd server && npx prisma studio` | DB peržiūra naršyklėje |

## Projekto struktūra

```
client/                 React + TS (Vite)
  src/pages/            Ekranai: LoginPage, LibraryPage, GamePage
  src/components/       Bendri komponentai (antraštė, pranešimai, progreso juosta)
  src/messages.ts       Visi lietuviški tekstai vienoje vietoje
  src/api.ts            Užklausos serveriui
server/                 Express + TS
  prisma/               DB schema ir migracijos
  src/auth/        AUT  Steam OpenID, sesijos, /api/me
  src/library/     BIB  Žaidimų biblioteka ir paieška
  src/achievements/PAS  Pasiekimai, progreso skaičiavimas
  src/sync/        ATN  Duomenų atnaujinimas (viena transakcija)
  src/steam/       SDG  Steam Web API klientas (timeout, pakartojimas)
  src/db/          DPK  Duomenų prieiga
  tests/                Vitest + supertest testai
docker-compose.yml      PostgreSQL
.env.example            Konfigūracijos pavyzdys
```

## REST API

Visi `/api/*` endpointai reikalauja prisijungimo (kitaip – `401`). Naudotojas visada nustatomas pagal sesiją.

| Metodas | Adresas | Paskirtis |
|---|---|---|
| GET | `/auth/steam` | Nukreipia į „Steam“ prisijungimą |
| GET | `/auth/steam/return` | „Steam“ grąžina naudotoją čia |
| POST | `/auth/logout` | Atsijungimas |
| GET | `/api/me` | Prisijungusio naudotojo profilis |
| GET | `/api/games?search=` | Žaidimų biblioteka (su paieška) |
| GET | `/api/games/:appId/achievements` | Žaidimo pasiekimai ir progresas |
| POST | `/api/sync` | Atnaujinti visą biblioteką |
| POST | `/api/games/:appId/sync` | Atnaujinti vieno žaidimo pasiekimus |

Klaidos grąžinamos formatu `{ "error": { "code": "..." } }`. Kodai: `UNAUTHORIZED`, `AUTH_FAILED`, `PROFILE_PRIVATE`,
`NOT_FOUND`, `VALIDATION_ERROR`, `STEAM_UNAVAILABLE` (su `hasCachedData`), `SYNC_IN_PROGRESS` (`409`).

## Darbo su Git tvarka

- `main` – stabili versija, `develop` – kūrimo šaka.
- Kiekvienam sprintui / funkcijai – atskira šaka iš `develop` (pvz. `sprint-1`).
- Commit žinutės pagal [Conventional Commits](https://www.conventionalcommits.org/): `feat(NI-1): ...`, `test: ...`, `docs: ...`, nurodant NI / FR numerius.
- Baigus – Pull Request į `develop`, kai `npm test` praeina.
