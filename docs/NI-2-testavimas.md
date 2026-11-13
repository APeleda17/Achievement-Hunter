# NI-2 „Achievement Redo“ patikra

Data: 2026-11-12. Apimtis: vietinė Ollama integracija ir NI-2, ne visas antras sprintas.
Paaiškinimų kalba pagal patikslintą reikalavimą – anglų; mygtukai ir pranešimai – lietuvių.

## Aplinka ir rezultatai

- Node.js 22.23.5, Prisma 6.1.0, PostgreSQL 16, Ollama 0.40.16.
- Modelis: `qwen3.5:9b`, vykdomas tik vietiniame kompiuteryje.
- `npm test`: 82 serverio ir 12 sąsajos testų praėjo (iš jų 36 ankstesnio sprinto testai).
- Atskirai paleistas `ollama.live.test.ts`: 1 tikro modelio integracinis testas praėjo.
- Iš viso: 95 sėkmingi automatiniai testai. Įprastame rinkinyje tikro modelio testas
  praleidžiamas sąmoningai ir vykdomas atskirai su `RUN_OLLAMA_TESTS=1`.
- `npm run build`: serveris ir klientas sėkmingai surinkti.
- `git diff --check`: klaidų nėra.
- DB migracija papildoma: sukurta `pasiekimo_paaiskinimas`, ankstesnės lentelės ir jų
  duomenys nešalinami. Automatiniai testai naudoja tik `achievement_hunter_test`.

## Reikalavimų atsekamumas

| Kriterijus | Patikra ir rezultatas |
|---|---|
| NI-2, DIS-02: paaiškinimas trumpesnis | Skaičiuojami NFC normalizuoti Unicode simboliai; tuščias, tokio pat ilgio ir ilgesnis tekstas atmetami. Originalas nekeičiamas. |
| DIS-01, API-11: išsaugotas rezultatas be DI | Pirma užklausa 202, baigta užduotis įrašo rezultatą, kita užklausa 200 ir modelio nebekviečia. Patikrinta ir nauja serverio instancija. |
| Talpyklos tinkamumas | Originalaus aprašo, pavadinimo ar užklausos šablono pokytis keičia kontrolinę sumą; senas tekstas nebegrąžinamas. Generavimo metu pasikeitęs originalas neišsaugomas. |
| API-07, FR-14: prieiga | Be sesijos 401; svetimas žaidimas / užduotis 404; įvestis ir JSON tikrinami; userId užklausos kūne nepriimamas. |
| EIL-02: iki 2 darbų ir nedubliavimas | Trečias darbas laukia; vieta atlaisvinama po sėkmės ar klaidos; tas pats aktyvus naudotojo prašymas gauna tą patį užduoties ID. |
| EIL-03: 10 min. ir savininkas | Iki galiojimo ribos rezultatas prieinamas savininkui; ties riba 404; kitas naudotojas jo nemato nei vykdant, nei baigus. |
| EIL-04: 120 s | Užduotis atšaukiama, būsena KLAIDA; pavėluotas modelio atsakymas nekeičia būsenos ir neįrašomas į DB. |
| DIK-01..04: Ollama ir JSON | Tik `/api/chat`, konfigūruotas adresas ir modelis, atskira sisteminė instrukcija ir JSON duomenys. Netinkamas JSON, kalba, schema ir neužbaigtas atsakymas atmetami. |
| DIK-04: 90 s | Tikras užklausos AbortSignal atšaukiamas po 90 s. Vienas leidžiamas pakartojimas šios bendros ribos nepratęsia. |
| Atsakymo tikslumo papildomos patikros | Negalima prarasti originale skaitmenimis nurodytų kiekių. Dažnų angliškų užduočių pradinis veiksmažodis saugomas, kad „get“ nebūtų pakeistas į „mount“. |
| GVS-10: eiga | Mygtukas blokuojamas generuojant; būsena tikrinama kas 2 s. Baigus, išėjus ar pakeitus pasiekimą tikrinimas sustoja. Pavėluotas seno pasiekimo atsakymas nerodomas. |
| GVS-11: DI žyma | Rodomi „Sugeneruota DI“, įspėjimas ir data. Modelio HTML pateikiamas kaip tekstas, nevykdomas. |
| Neprieinamas DI / trūksta aprašo | Aiškus pranešimas ir galimybė bandyti dar kartą; be tinkamo originalo modelis nekviečiamas. |

Automatinių scenarijų failai: `server/tests/aiExplain.test.ts`, `jobs.test.ts`,
`ollamaClient.test.ts`, `ollama.live.test.ts`, `client/tests/AchievementRedo.test.tsx`.

## Tikro modelio pavyzdžiai

Šie šeši „Half-Life 2“ aprašymai patikrinti su tikra vietine Ollama. Patikrinta, kad
išliko veiksmas, tikslinis objektas ir apribojimai; lentelėje ilgis skaičiuojamas simboliais.
Šie bandymai nepakeitė originalių Steam duomenų.

| Originalas | Paaiškinimas | Ilgis prieš → po |
|---|---|---|
| Escape the apartment block raid. | Escape apartment block raid. | 32 → 28 |
| Break the mini-teleporter in Kleiner's lab. | Break mini-teleporter in Kleiner's lab. | 43 → 39 |
| Get the crowbar. | Get crowbar. | 16 → 12 |
| Kill five barnacles with one barrel. | Kill 5 barnacles with one barrel. | 36 → 33 |
| Get the airboat. | Get airboat. | 16 → 12 |
| Get the airboat's mounted gun. | Get airboat's mounted gun. | 30 → 26 |

Papildomas viso kelio bandymas: „Find all five hidden rooms without restarting the
level.“ → trumpesnis angliškas paaiškinimas, išsaugotas testinėje DB. Pakartojus
užklausą rezultatas grįžo net modelio pakaitalą pakeitus į klaidą grąžinantį adapterį.

## Ribos

JSON, ilgio, skaičių ir veiksmažodžių patikros negarantuoja visų galimų atsakymų
faktinio tikslumo. Todėl sąsajoje lieka originalas ir privalomas DI įspėjimas.
Labai trumpam ar neaiškiam originalui nepavykus gauti tinkamo trumpesnio teksto,
rodomas pranešimas; tekstas nenukerpamas ir netinkamas rezultatas neišsaugomas.

Užduočių eilė laikoma vieno serverio proceso atmintyje. Paaiškinimai laikomi PostgreSQL
ir išlieka perkrovus serverį; nebaigtą užduotį po perkrovimo reikia pateikti iš naujo.
NI-3, NI-4 ir NI-5 funkcijos į šios patikros apimtį neįtrauktos.
