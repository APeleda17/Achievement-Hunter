# NI-3 „AI Guide“ patikra

Data: 2026-11-13. Sugeneruotų vadovų kalba – anglų pagal naudotojo sprendimą;
sąsajos pranešimai – lietuvių. Modelis – vietinis `qwen3.5:9b` per Ollama.

## Automatinių patikrų rezultatai

- `npm test`: **156 serverio ir 23 kliento testai praėjo** (179 iš viso).
- Įprastame rinkinyje 22 tikro modelio bandymai praleidžiami: 21 NI-3 ir vienas NI-2.
  Jie paleidžiami atskirai, nustačius atitinkamą aplinkos kintamąjį.
- `npm run build`: serverio TypeScript ir kliento TypeScript/Vite surinkimas praėjo.
- Vietinis API `/api/health` grąžino `ok`, svetainė – HTTP 200.
- Tikri šaltiniai ir Ollama patikrinti su **21 pasiekimu iš 11 žaidimų / versijų**.
  Paskutinis bendras paleidimas: 20 / 21 sėkmingi; L4D2 šaltinis laikinai grąžino
  neprieinamumo klaidą. Atskirai pakartotas L4D2 ir abu Black Ops III atvejai
  praėjo (3 / 3). Taigi kiekvienam iš 21 atvejo gautas sėkmingas tikras rezultatas,
  bet vieno bendro internetinio paleidimo sėkmė negarantuojama.

## Aprėpties perdirbimas

Ankstesnė versija praleisdavo pasiekimų pavadinimus, esančius už `.subSectionDesc`
ribų, perskaitydavo tik tris gidus ir atmesdavo trumpas, bet pakankamas instrukcijas.
Nauja versija skaito ir antraštes, rikiuoja pilnus anglų kalbos gidus, peržiūri daugiau
kandidatų ir nenaudoja kitame pasiekime tik paminėto to paties pavadinimo daikto.
Prireikus tikrinama originali sąlyga, įskaitant trumpas „Reach Level 5“ sąlygas.

Sąlygas ir pavadinimus normalizuojant atpažįstamos `Lv` / `Lvl` santrumpos,
apostrofai ir nedidelės ilgesnio pavadinimo klaidos. Kitų to paties žaidimo pasiekimų
pavadinimai ir HTML antraštės apriboja ištrauką; patikros apima ir klaidingai
parašytą kito pasiekimo antraštę.
Steam `bb_table_tr` / `bb_table_td` eilutės taip pat išskiriamos atskirai:
„Wings“ ištrauka nebegali atsinešti „Crown“ bei kitų lentelės pasiekimų sąlygų.

GTA V Enhanced gali remtis peržiūrėtais to paties GTA V Legacy gidais. Šaltinio
pavadinimas pažymimas tikrąja versija. Kito žaidimo ar tęsinio gidas nepriimamas
vien dėl panašaus pavadinimo. Balatro ir Vampire Survivors turi ir viešų wiki
atsarginį kelią, nepriklausomą nuo konkretaus Steam gido pasiekiamumo.

Paprastą tik vienu sakiniu patvirtintą tikslą modelis gali pateikti vienu veiksmu.
Trumpam šaltiniui JSON schema neleidžia išgalvoti kelių etapų. Tai patikrinta su
„3 Times Around Olympian“: iš trijų medalių modelis nebegali padaryti trijų
išgalvotų lygių. Išsamesniam šaltiniui tebenaudojami iki aštuonių žingsnių.

Black Ops III bandymas taip pat atskleidė prasminę klaidą: misijos „Black Ops“
užbaigimą modelis kartais paversdavo visos kampanijos užbaigimu. Adapteris dabar
atskirai perduoda konkrečios CoD misijos tikslą, reikalauja tikslaus jos pavadinimo
ir atmeta visos kampanijos reikalavimą. Tikras pakartojimas grąžino „Complete the
Black Ops mission on Hardened, Veteran, or Realistic difficulty.“

Visi pasirenkamo tikro modelio bandymo atvejai ir jų šaltiniai tikrinami per
autorizuotą API, bendrą eilę ir tikrą PostgreSQL testinę DB. Antroji užklausa turi
grąžinti 200 be pakartotinio modelio kvietimo.

## Reikalavimų ir patikrų atsekamumas

| Reikalavimas | Įgyvendinimas ir patikra |
|---|---|
| NI-3 / FR-17: išorinė informacija, vadovas žingsniais | ISR → DIS → DIK → DPK; `aiGuide.test.ts`, `guide.live.test.ts` |
| NI-3 / FR-18 / DIS-03: nėra patikimos informacijos | `NO_RELIABLE_INFO`, tušti šaltiniai nekviečia DI; `aiGuide.test.ts`, `sources.test.ts` |
| DIS-01,04 / API-07,11: 200 talpykla arba 202 ir užduotis | `aiGuide.test.ts`: DB išlikimas po naujos programos instancijos, pasenimo ir sugadinimo atmetimas |
| ISR-01: paieška leidžiamuose wiki ir Steam giduose | `registry.ts`, konkretaus žaidimo ID ir pasiekimo paieška, atsarginė bendrų gidų paieška; `sources.test.ts`, `guide.live.test.ts` |
| ISR-02: susijęs tekstas, iki 4000 simbolių | `extract.ts`; kito žaidimo ir nesusijusių puslapių atmetimas; `sources.test.ts` |
| Platesnė paieška ir pakartotinis žaidimo indekso naudojimas | `sourceDiscovery.test.ts`: šeštas gidas, neteisinga kategorija, atminties indeksas, tikra gavimo data, versijų patvirtinimas |
| ISR-03: pavadinimas, URL, gavimo data, 30 d. talpykla | Prisma `ExternalSource` ir `SourceExcerpt`; `sources.test.ts` su tikra testine PostgreSQL |
| ISR-04: 10 s, robots ir Crawl-delay | `sourceHttp.ts`; robots draudimas/404/503, nukreipimų tikrinimas, laiko ir dydžio ribos; `sources.test.ts` |
| DIK-01..04: atskiras šablonas, JSON, 90 s | `guideModel.test.ts`: modelio protokolas, citatos, blogas JSON, bendras pakartojimo laikas |
| DIK-05: ne daugiau nei du iš eilės kopijuoti sakiniai | `guideValidation.ts`; `guideModel.test.ts`, kopijavimas per žingsnių ribas, ištisos ištraukos |
| EIL-01..04: bendra 2 darbų eilė, 120 s, 10 min. | Tas pats `app.ts` eilės egzempliorius NI-2 ir NI-3; `jobs.test.ts`, `aiGuide.test.ts` pavėluoto įrašo atmetimas |
| DPK-03..05 / FR-14: prieiga ir transakcijos | Sesija, žaidimo priklausomybė prieš talpyklą, užduoties savininkas; `aiGuide.test.ts` |
| DB-04 NI-3 dalis: žingsniai, šaltiniai ir data | Migracija `20261113133334_ni3_ai_guide`, Prisma integraciniai testai |
| GVS-10,11: būsena, rezultatas, DI žyma | `AchievementGuide.test.tsx`: 2 s, pasikartojimas, atšaukimas, šaltinių nuorodos, datos ir įspėjimas |

`API-08` aprašo „I'm Stuck!“ lauką ir nėra šios funkcijos reikalavimas.
NI-4 papildymas: `GET /api/guides/{id}/sources` sinchroniškai pateikia vadovo
sudarymo datą ir tik panaudotų šaltinių metaduomenis citavimo tvarka. Sesija ir
žaidimo priklausomybė tikrinamos kiekvieną kartą; neprieinamas ir neegzistuojantis
vadovas grąžina tą patį 404. Duomenų prieigos užklausa apribota naudotojo biblioteka.
Šaltinių ištraukos negrąžinamos, naudojama vadovo kopijoje išsaugota gavimo data,
o ne vėlesnė bendro šaltinio atnaujinimo data. Skaitant nekviečiami ISR, DIK ar EIL.
`guideSources.test.ts` tikrina šį API su tikra testine PostgreSQL: 14 atvejų, įskaitant
401, svetimą / neegzistuojantį vadovą, pašalintą žaidimą, suklastotus parametrus,
bendrą vadovą turint tą patį žaidimą, netinkamus ID, tvarką ir išlikimą po perkrovimo.

## Vykdymas

Iš projekto šaknies, veikiant PostgreSQL:

```powershell
npm test
npm run build
```

Testų paruošimas pritaiko migracijas tik atskirai testinei bazei. Duomenų išvalymo
testuose negalima nukreipti į naudotojo `achievement_hunter` bazę.

Su paleista Ollama, parsiųstu modeliu ir interneto prieiga:

```powershell
$env:RUN_GUIDE_TESTS='1'
npm.cmd test --prefix server -- guide.live.test.ts
Remove-Item Env:RUN_GUIDE_TESTS
```

Šis bandymas turi 21 pasiekimo atvejį iš 11 žaidimų / versijų: Half-Life 2, GTA IV,
GTA V Legacy ir Enhanced, Bloons TD5, Black Ops III, Terraria, Garry's Mod,
Left 4 Dead 2, Vampire Survivors ir Balatro. HTTP šaltiniai ir modelis tikri; Steam prisijungimas pakeistas tik testų
aplinkoje. Produkto kode testinio prisijungimo maršruto nėra. Tikrinami žingsniai,
galiojančios citatos, įrašas į DB ir antras 200 atsakymas be naujo modelio kvietimo.
Papildomai tikrinama, ar laužtuvo vadovas baigiamas jo paėmimu, o barnaklių vadovas
išlaiko penkių taikinių sąlygą. Faktinį viso teksto tikslumą vis tiek reikia įvertinti.

Daliniam pakartojimui galima nustatyti, pavyzdžiui,
`$env:GUIDE_LIVE_APPS='306020,311210'`. Pasirenkamas `GUIDE_REPORT_PATH` išsaugo
JSON ataskaitą su būsenomis, žingsniais, laiku ir tikrais viešų šaltinių tekstais;
produkto naudotojo sesijų ar Steam API rakto joje nėra. Baigus šiuos aplinkos
kintamuosius reikia pašalinti. Įprastas `npm test` interneto ir modelio nekviečia.

## Aprėptis ir ribojimai

- Prijungti šeši wiki žaidimai; Steam paieška veikia pagal kiekvieno žaidimo ID,
  nereikalaujant papildomos žaidimų lentelės kode. Iki 12 kandidatų rikiuojami
  kiekvienai paieškai, iki 24 gidų skaitomi per užduotį; skirtingiems paieškos
  variantams rezervuojama vietos ir bendrame 22 s paieškos biudžete. Ne visiems
  pasiekimams bus viešas tekstinis gidas. Tikro modelio 21 atvejo rinkinys nėra
  viso Steam katalogo aprėpties procento matavimas.
- Gidų sąrašai atmintyje naudojami 10 min., ribotas išskaidytų gidų indeksas –
  15 min. / iki 6 MB. PostgreSQL ištraukos naudojamos 30 dienų. Naujos šablono ir
  ištraukų versijos panaikina ankstesnio rezultato tinkamumą automatiškai.
- Tinklo 429, galiojantis `Retry-After`, robots draudimas ir turinio perspėjimas
  nėra įrodymas, kad žaidimas neturi gido. Tokie nepavykę bandymai nepaverčiami
  neigiamais paieškos įrašais. Prieigos perspėjimai automatiškai nepatvirtinami.
- Leidžiamas domenas ir susijusi ištrauka nėra garantija, kad bendruomenės gidas
  teisingas. Informacija gali pasenti, o modelis gali klaidingai ją apibendrinti.
  Dėl to pateikiami šaltiniai ir DI įspėjimas; automatinė patikra nėra žmogaus peržiūra.
- Kopijavimo patikra normalizuoja raides, tarpus ir skyrybą, išskiria sakinius su
  `Intl.Segmenter`. Tai tiesioginio teksto sutapimo, o ne semantinio plagijavimo detektorius.
- Šaltinių HTML negeneruojamas naršyklėje; rodomas React tekstas. Skriptai, navigacija
  ir komentarai neįtraukiami į ištraukas. LLM gauna tekstus kaip nepatikimus duomenis.
- Nebaigti darbai laikomi atmintyje, todėl serverio perkrovimas juos panaikina.
  Baigti vadovai ir šaltiniai išlieka PostgreSQL.
