# NI-5 „I'm Stuck!“

Data: 2026-11-13. Modelis: vietinis `qwen3.5:9b` per Ollama. Atsakymai – anglų,
sąsaja – lietuvių. Naudotojo problema gali būti ir lietuvių kalba.

## Veikimas

Naudotojas atidaro pagalbos formą pasirinkto pasiekimo kortelėje, įrašo 1–500
simbolių problemą ir gauna galimas priežastis bei sprendimo veiksmus. Kiekviena
priežastis ir žingsnis turi nuorodą į panaudotą šaltinį. Atsakymas pažymimas DI,
rodoma sudarymo data bei netikslumo įspėjimas.

Prieš darbą tikrinama sesija, žaidimas ir normalizuoto aprašo ilgis. Problema laikoma
atskiru nepatikimų duomenų lauku, niekada netampa sistemine instrukcija ar viešos
paieškos tekstu. Netinkami naudotojo ID ir URL laukai atmetami. Tikros pasiekimo
sąlygos imamos iš DB. ISR komponentas ir jo talpyklos bendri su NI-3.

Sėkminga problemos ir atsakymo pora saugoma `pagalbos_uzklausa`: naudotojo ir
pasiekimo FK, 500 simbolių aprašas, priežastys, žingsniai, modelis, UTC data ir
šaltinių ištraukų kopijos. Ta pati užklausa iki 30 d. grąžinama be DI, jei pirminė
sąlyga ir šablonas nepasikeitė, o šaltiniai nepaseno. Istorija privati ir išlieka
po serverio perkrovimo; API / UI rodo paskutinius 10 įrašų šiam pasiekimui.

## Reikalavimai ir patikros

| Reikalavimas | Patikra |
|---|---|
| NI-5 / FR-20 / GVS-12 / API-08: 1–500 simbolių, netuščias aprašas | `aiHelp.test.ts`, `AchievementHelp.test.tsx`: 0, 1, 500, 501, tarpai, emoji ir NFC kombinacijos |
| NI-5 / FR-21 / DIS-05: sąlygos, šaltiniai ir atskira naudotojo problema | `aiHelp.test.ts`, `helpModel.test.ts`: patikimi DB duomenys, problema tik JSON lauke ir nepatenka į ISR |
| Galimos priežastys bei sprendimo žingsniai | JSON schema, citatų ID ir teksto ribos; `helpModel.test.ts`, `help.live.test.ts` |
| DIK-02 / NF-19: nepatikimos instrukcijos atskiriamos | `helpModel.test.ts`: vartotojo tekstas ne sistemos žinutėje; nepriimami papildomi kliento laukai; React tekstas nevykdo HTML |
| DIK-03..05: atsakymo tikrinimas, 90 s, kopijavimas | `helpModel.test.ts`: blogas JSON, kalba, nežinomos citatos, trys kopijuoti sakiniai per priežasčių/žingsnių ribą, pakartojimas ir atšaukimas |
| Nepagrįstų papildomų sąlygų atmetimas | `assertSupportedAdvice`: spėjami klavišai, nesuteikti meniu keliai, reikalavimai nemirti ar nedelsiant paimti daiktą |
| API-11 / DIS-01: 200 talpykla arba 202 užduotis | `aiHelp.test.ts`: atskira savininko talpykla, kitokia problema, sąlygų pasikeitimas, 30 d. atsakymo / šaltinio pasenimas |
| EIL-01..04: bendra eilė, savininkas, 120 s | `aiHelp.test.ts`: aktyvių užklausų nedubliavimas, NI-2 / NI-3 / NI-5 dalijasi dviem lizdais, pavėluoto įrašo atmetimas |
| DPK-03..05 / DB-04: privatus saugojimas | Prisma migracija `20261113151053_ni5_im_stuck`, transakcija, istorija po naujos serverio instancijos |
| GVS-10..11: siuntimas, laukimas, DI žyma | `AchievementHelp.test.tsx`: užrakintas siuntimas, 2 s polling, atšaukimas, 401, istorija, datos ir šaltiniai |

## Tikras modelis

`RUN_HELP_TESTS=1 npm test --prefix server -- help.live.test.ts` tikrina:

1. Half-Life 2 / Barnacle Bowling: sprogimas nužudo tik du, o reikia penkių barnaklių.
2. Black Ops III / Disavowed: misija įvykdyta Recruit sunkumu, nors reikia Hardened,
   Veteran arba Realistic. Tikrinama viena konkreti misija, ne visa kampanija.
3. GTA V Enhanced / Welcome to Los Santos: baigtas tik prologas, o reikia Franklin
   and Lamar misijos; naudojamas aiškiai pažymėtas Legacy šaltinis.
4. Half-Life 2 / Trusty Hardware: lietuviškai pranešta, kad Barney numetė laužtuvą,
   tačiau pasiekimas neatsirado. Atsakymas turi nurodyti jį paimti, nespėjant E/F klavišo.

Kiekvienas scenarijus pereina per API, eilę, tikrus viešus šaltinius, vietinį modelį,
testinę DB, antrą 200 atsakymą be DI ir savininko istoriją. Steam prisijungimas
pakeistas tik testų aplinkoje; produkto kode testinio prisijungimo nėra.

## Galutiniai rezultatai

2026-11-13 patikrinta:

- `npm test`: 242 testai sėkmingi (205 serverio ir 37 kliento). Pagal nutylėjimą
  praleidžiami 26 tikro modelio testai, įjungiami atskirais aplinkos kintamaisiais.
- `RUN_HELP_TESTS=1 npm test --prefix server -- help.live.test.ts`: visi 4 aukščiau
  aprašyti bandymai sėkmingi su tikrais šaltiniais ir `qwen3.5:9b`.
- `npm run build`: serverio TypeScript ir kliento Vite surinkimas sėkmingi.
- Veikianti vietinė API: `/api/health` grąžina `ok`; svetainė prievade 5173 – HTTP 200.
- Migracija pritaikyta vietinei kūrimo DB; automatiniai bandymai keičia tik atskirą
  testinę DB, naudotojo bibliotekos duomenys išsaugoti.

## Ribojimai

Šaltinių ir modelio prieinamumas priklauso nuo tinklo bei veikiančios Ollama.
Neradus tinkamos informacijos grąžinama aiški klaida, išgalvotas atsakymas nesaugomas.
Formatas, citatos ir žinomų klaidų požymiai tikrinami automatiškai, tačiau tai nėra
viso teksto semantinio tikslumo ar visiško atsparumo instrukcijų injekcijoms įrodymas.
Priežastys lieka tik galimybės; naudotojas gali patikrinti originalų šaltinį.

Kliento atšaukimas sustabdo laukimą, o ne naikina jau serverio vykdomą užduotį.
Nebaigti darbai laikomi atmintyje; baigti atsakymai lieka PostgreSQL. Ankstesnė
istorija gali atspindėti senesnes pasiekimo sąlygas, todėl rodoma jos data.

Šis pakeitimas įgyvendina NI-5; atskiras NI-4 vadovo šaltinių API lieka kita užduotis.
