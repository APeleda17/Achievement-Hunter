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
| `npm test` | Serverio ir sąsajos testai |
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

## 2 sprintas: NI-2 „Achievement Redo“

Pasiekimo lange mygtukas **Paaiškinti** pateikia trumpesnį anglišką aprašymą.
Originalus „Steam“ tekstas išlieka matomas. Rezultatas pažymimas „Sugeneruota DI“,
rodoma jo data ir įspėjimas, kad DI gali suklysti. Pasiekimui be aprašymo mygtukas išjungtas.

### Ollama paruošimas

Įdiekite [Ollama](https://ollama.com/download/windows), paleiskite ją ir parsisiųskite modelį:

```powershell
ollama pull qwen3.5:9b
```

`server/.env` papildykite pagal `.env.example`:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_TIMEOUT_MS=90000
```

Modelis gali būti pakeistas į kompiuteriui tinkamą lokaliai įdiegtą modelį.
Paaiškinimų kalba – anglų, vartotojo sąsajos pranešimai – lietuvių. Atsakymų kokybę
pakeitus modelį reikia patikrinti iš naujo.
Jei Ollama veikia kitame vykdymo mazge, keičiamas serverio `OLLAMA_BASE_URL`.
Naršyklė tiesiogiai į Ollama nesikreipia; Steam raktas ir sesijos jai neperduodami.

Pritaikykite migraciją ir sugeneruokite Prisma klientą iš `server/`:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Po `.env` pakeitimų serverį paleiskite iš naujo. Pagrindinės Steam funkcijos veikia ir
nepaleidus Ollama; paaiškinimo užklausa tuomet grąžina aiškų DI nepasiekiamumo pranešimą.

### NI-2 API ir vykdymas

- `POST /api/ai/explain`, JSON `{ "appId": 620, "apiName": "ACH_NAME" }`.
  `200` grąžina DB išsaugotą paaiškinimą; `202` – `{ "jobId": "...", "status": "LAUKIA" }`.
- `GET /api/jobs/{id}` grąžina `LAUKIA`, `VYKDOMA`, `BAIGTA` (su `result`) arba `KLAIDA` (su `error.code`).
- Naudotojas nustatomas tik iš sesijos. Prieš bet kokį talpyklos skaitymą tikrinama
  žaidimo priklausomybė; užduotį mato tik jos savininkas.
- EIL viename serverio procese vykdo iki 2 užduočių, nedubliuoja vienodos aktyvios
  naudotojo užklausos, darbą nutraukia po 120 s. Baigtos užduoties būsena ir rezultatas
  saugomi 10 min. Klientas tikrina būseną kas 2 s ir sustoja išėjus iš ekrano.
- DIK kviečia tik `/api/chat`, reikalauja JSON, tikrina atsakymą ir taiko iki 90 s limitą.
  Tik netuščias, už originalą trumpesnis paaiškinimas, išlaikantis originale esančius
  skaičius, gali būti įrašytas į DB. Netinkamą atsakymą leidžiama pakartoti vieną kartą
  per tą pačią bendrą 90 s ribą. Tekstas niekada nenukerpamas, kad dirbtinai tilptų.
- `pasiekimo_paaiskinimas` saugo vieną paaiškinimą pasiekimui. Aprašo, pavadinimo ar
  šablono pasikeitimas panaikina talpyklos tinkamumą. Ši lentelė išlieka po serverio
  perkrovimo; trumpalaikė užduočių eilė laikoma atmintyje, todėl vienu metu naudokite
  vieną programos serverio procesą. Po jo perkrovimo nebaigtą užklausą reikia pakartoti.
- Papildomi kodai: `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`, `AI_JOB_TIMEOUT`,
  `AI_QUEUE_FULL`, `NO_DESCRIPTION`, `SOURCE_CHANGED`.

### Reikalavimų patikra

`npm test` iš projekto šaknies vykdo ir serverio, ir kliento testus. Automatiniams
testams naudojama tik `achievement_hunter_test`; tikras Steam ar Ollama nekviečiamas.
NI-2 atsekamumas: `DIS-01..02`, `DIK-01..04`, `EIL-01..04`, `API-07`, `API-11`,
`GVS-10..11`, `DPK-05` ir NI-2 dalis `DB-04`.

| Reikalavimas | Patikra |
|---|---|
| Trumpesnis paaiškinimas, originalas nekeičiamas | `aiExplain.test.ts`, `ollamaClient.test.ts` |
| Išsaugoto rezultato naudojimas be DI, pasenusios talpyklos atmetimas | `aiExplain.test.ts` |
| Sesija, žaidimo priklausomybė, užduoties savininkas | `aiExplain.test.ts`, esami `security.test.ts` |
| Du darbai, nedubliavimas, 120 s, 10 min. | `jobs.test.ts`, `aiExplain.test.ts` |
| JSON tikrinimas, 90 s, tinklo klaidos, atšaukimas | `ollamaClient.test.ts` |
| Mygtukas, 2 s tikrinimas, DI žyma, įspėjimas, ekrano pakeitimas | `client/tests/AchievementRedo.test.tsx` |

Rankinė patikra su tikru modeliu: prisijungti, atidaryti žaidimą, paspausti „Paaiškinti“,
įvertinti anglų kalbą ir sąlygos prasmę, pakartoti užklausą ir patikrinti momentinį
išsaugoto atsakymo pateikimą. Sustabdžius Ollama naujas paaiškinimas turi baigtis
pranešimu, o anksčiau išsaugotas turi likti prieinamas.

Tikro modelio automatinis integracinis bandymas (PowerShell; Ollama turi veikti):

```powershell
$env:RUN_OLLAMA_TESTS='1'
npm.cmd test --prefix server -- ollama.live.test.ts
Remove-Item Env:RUN_OLLAMA_TESTS
```

Šis bandymas tikrina visą API → eilės → tikro modelio → testinės DB → talpyklos kelią.
Patikrų rezultatai ir reikalavimų atsekamumas: [NI-2 testavimas](docs/NI-2-testavimas.md).
Kalbos taisyklingumas ir visos sąlygos prasmės išlaikymas papildomai vertinami žmogaus;
vien JSON ir teksto ilgio patikra to negarantuoja. Kai modelis nesugeba pateikti tinkamo
trumpesnio teksto (ypač labai trumpam originalui), rodomas pranešimas ir rezultatas
neišsaugomas. Išsaugotų paaiškinimų turinį taip pat reikia vertinti kritiškai.

## NI-3 „AI Guide“

Prie kiekvieno pasiekimo mygtukas **AI Guide** parengia 1–8 angliškus atlikimo
žingsnius iš rastų išorinių šaltinių. Rodomos citatų nuorodos, naudotų šaltinių
pavadinimai, gavimo ir vadovo datos bei DI netikslumo įspėjimas. Mygtukas veikia ir
be Steam aprašo: ieškoma pagal žaidimą ir pasiekimo pavadinimą.

Naudojama ta pati NI-2 Ollama konfigūracija ir bendra dviejų užduočių eilė.
Atnaujinus kodą, iš `server/` pritaikykite migraciją ir paleiskite serverį iš naujo:

```powershell
npx prisma migrate deploy
npx prisma generate
```

- `POST /api/ai/guide` priima tik `{ "appId": 220, "apiName": "ACH_NAME" }`.
  `200` pateikia tinkamą išsaugotą vadovą, `202` – užduoties ID. Būsena tikrinama
  tuo pačiu `GET /api/jobs/{id}`, klientas laukia po 2 s.
- ISR pirmiausia tikrina 30 dienų ištraukų talpyklą. Steam paieška veikia pagal bet
  kurį žaidimo ID: anglų pasiekimų kategorija → konkretus pasiekimo pavadinimas →
  bendri pasiekimų gidai → likę anglų gidai. Pilni 100 % gidai reitinguojami aukščiau.
  Vienoje paieškoje atrenkama iki 12 kandidatų, per užduotį perskaitoma iki 24 gidų;
  radus tinkamą tekstą paieška baigiama. Šaltinių paieškos bendras biudžetas – 22 s,
  kad bendroje 120 s užduotyje liktų vietos 90 s modelio ribai.
- Skaitoma ir `.subSectionTitle` antraštė, ir `.subSectionDesc` turinys, vidinės
  antraštės, lentelės ir atskiri paryškinti pavadinimai. Atpažįstamos nedidelės
  ilgesnio pavadinimo rašybos klaidos; kitų šio žaidimo pasiekimų pavadinimai nustato
  ištraukų ribas. Originali sąlyga taip pat padeda rasti pervadintą pasiekimą.
- Vieną paprastą sąlygą patvirtinantis paskelbtas gidas yra tinkamas šaltinis.
  Trumpam šaltiniui modelio JSON schema leidžia tik vieną veiksmą, kad nebūtų
  išgalvojami papildomi lygiai, meniu ar užduoties etapai. Be šaltinio modelis nekviečiamas.
- Wiki puslapių sąrašas nustatomas `server/src/sources/registry.ts`: pradinė aprėptis
  yra Half-Life 2, Portal, Portal 2, Team Fortress 2, Balatro ir Vampire Survivors. Steam gidų paieška vykdoma
  visiems žaidimams be atskiro žaidimo įtraukimo į registrą. Nauji wiki prijungiami
  papildant sąrašą ir tikrinant jų HTML. Viešo tekstinio gido neturinčiam ar šaltinio
  prieigą ribojančiam žaidimui vadovas negarantuojamas.
- GTA V Enhanced ieško ir patvirtintos tos pačios GTA V Legacy versijos giduose;
  prie šaltinio pavadinimo aiškiai rodoma Legacy žyma. Atsitiktinių panašiai pavadintų
  žaidimų gidai nepriimami. Modelis negali laikyti senos versijos internetinių
  funkcijų ar išnaudojimų galiojančiais be atitinkamo pagrindimo.
- Visi šaltinių URL nustatomi serveryje. Kiekvienam HTTP prašymui taikoma 10 s riba,
  tikrinamas domenas ir nukreipimai, robots.txt bei Crawl-delay; puslapiai ribojami
  2 MB. Steam API raktas, sesijos ir naudotojo duomenys šaltiniams neperduodami.
- Galioja `Retry-After`. 429 be šios antraštės sustabdo to paties ištekliaus
  pakartojimą minutei ir sulėtina kitų puslapių skaitymą. Vienas neprieinamas gidas
  nelaikomas visų žaidimų neveikimu. Turinio perspėjimai automatiškai nepatvirtinami.
- Iš vieno šaltinio saugoma iki 4000 simbolių aktualaus teksto. Tas pats URL gali
  turėti skirtingas ištraukas keliems pasiekimams. Prisma lentelės:
  `isorinis_saltinis`, `saltinio_istrauka`, `vadovas`, `vadovo_saltinis`.
  Vadovo ir panaudotų ištraukų susiejimas įrašomas transakcija; jo ištraukų
  momentinė kopija nekeičiama renkant informaciją kitam pasiekimui.
- To paties žaidimo kitiems pasiekimams dar naudojamas ribotas atminties indeksas:
  gidų sąrašai – 10 min., išskaidyti gidai – 15 min. / iki 6 MB. Išsaugoma tikroji
  teksto gavimo data, o ne kiekvieno panaudojimo laikas. Pilnas HTML DB nesaugomas.
- DIS negavęs aktualių šaltinių grąžina `NO_RELIABLE_INFO` ir **modelio nekviečia**.
  Visiškas šaltinių tinklo sutrikimas pranešamas kaip `SOURCES_UNAVAILABLE`.
  Modelis taip pat gali atsisakyti generuoti, jeigu ištraukų nepakanka.
- DIK reikalauja tikrinamo JSON, 1–8 žingsnių ir galiojančių šaltinių ID kiekvienam
  žingsniui. Atmetamos ištisai pakartotos ištraukos bei daugiau nei du iš eilės
  kopijuoti sakiniai. Sakiniai tikrinami ir per žingsnių ribas. Ši patikra aptinka
  tiesioginį kopijavimą, bet negarantuoja faktų tikslumo ar teisinio vertinimo.
- Vadovas iš DB naudojamas iki 30 dienų nuo panaudotų šaltinių gavimo; pakeitus
  pasiekimo duomenis ar modelio instrukcijos versiją jis generuojamas iš naujo.
  Šaltinių pakeitimas svetainėje pastebimas atnaujinant talpyklą, ne realiu laiku.

Tikri vieši puslapiai ir vietinis modelis tikrinami atskiru pasirenkamu bandymu:

```powershell
$env:RUN_GUIDE_TESTS='1'
npm.cmd test --prefix server -- guide.live.test.ts
Remove-Item Env:RUN_GUIDE_TESTS
```

Bandymas naudoja tik `achievement_hunter_test`. Įprastas `npm test` tikrina API,
šaltinių išskyrimą, robots politiką, talpyklą, modelio atsakymo tikrinimą ir UI su
valdomais pakaitalais; interneto ar veikiančio modelio nereikia. Reikalavimų
atsekamumas ir praktiniai ribojimai: [NI-3 testavimas](docs/NI-3-testavimas.md).

## Darbo su Git tvarka

- `main` – stabili versija, `develop` – kūrimo šaka.
- Kiekvienam sprintui / funkcijai – atskira šaka iš `develop` (pvz. `sprint-1`).
- Commit žinutės pagal [Conventional Commits](https://www.conventionalcommits.org/): `feat(NI-1): ...`, `test: ...`, `docs: ...`, nurodant NI / FR numerius.
- Baigus – Pull Request į `develop`, kai `npm test` praeina.
