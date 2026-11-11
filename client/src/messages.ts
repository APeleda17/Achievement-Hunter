// Vienas lietuviškų užrašų ir pranešimų katalogas (GVS-09).
// Tekstai – pagal projekto dokumento 29 lentelę „Sistemos pranešimų pavyzdžiai“.

export const t = {
  appName: 'Achievement Hunter',

  // Prisijungimas (NI-1)
  loginTitle: 'Visi jūsų „Steam“ pasiekimai vienoje vietoje',
  loginButton: 'Prisijungti per Steam',
  loginHint: 'Prisijungimas vyksta „Steam“ puslapyje – „Achievement Hunter“ jūsų slaptažodžio nemato ir nesaugo.',
  loginFailed: 'Prisijungti nepavyko. Bandykite dar kartą per „Steam“.',
  privacyNote:
    'Saugome tik jūsų „SteamID“, slapyvardį, avatarą bei žaidimų ir pasiekimų duomenis. ' +
    '„Achievement Hunter“ nėra oficialus „Valve“ produktas.',
  logout: 'Atsijungti',

  // Privatus profilis (FR-04)
  privateTitle: 'Žaidimų duomenų nepavyko gauti. Patikrinkite „Steam“ privatumo nustatymus.',
  privateSteps: [
    'Atidarykite „Steam“ profilį → „Redaguoti profilį“ → „Privatumo nustatymai“.',
    'Nustatykite „Mano profilis“ – „Viešas“.',
    'Nustatykite „Žaidimo informacija“ („Game details“) – „Vieša“.',
    'Grįžkite čia ir paspauskite „Atnaujinti“.',
  ],
  privateLink: 'Atidaryti „Steam“ privatumo nustatymus',

  // Biblioteka (NI-6)
  libraryTitle: 'Žaidimų biblioteka',
  searchLabel: 'Ieškoti žaidimo',
  searchPlaceholder: 'Įveskite pavadinimo dalį…',
  libraryEmpty: 'Žaidimų bibliotekoje kol kas nerasta žaidimų.',
  searchEmpty: 'Pagal įvestą pavadinimą žaidimų nerasta.',
  progressUnknown: 'Progresas nežinomas – atidarykite žaidimą arba paspauskite „Atnaujinti“',
  noAchievements: 'Šis žaidimas neturi pasiekimų.',
  gamesCount: (n: number) => `Žaidimų: ${n}`,

  // Pasiekimai (NI-7)
  backToLibrary: '← Į biblioteką',
  achievementsTitle: 'Pasiekimai',
  unlocked: 'Atrakintas',
  locked: 'Neatrakintas',
  unlockedOn: (date: string) => `Atrakinta ${date}`,
  gameNotFound: 'Šis žaidimas jūsų bibliotekoje nerastas.',

  // Atnaujinimas (NI-8)
  refresh: 'Atnaujinti',
  refreshing: 'Atnaujinami „Steam“ duomenys…',
  refreshDone: 'Duomenys sėkmingai atnaujinti.',
  lastSync: (date: string) => `Paskutinis atnaujinimas: ${date}`,
  neverSynced: 'Duomenys dar neatnaujinti',
  showingCached: 'Duomenų atnaujinti nepavyko. Rodomi paskutiniai išsaugoti duomenys.',
  noData: 'Duomenų gauti nepavyko. Pabandykite atnaujinti vėliau.',
  syncInProgress: 'Atnaujinimas jau vyksta. Palaukite, kol jis baigsis.',
  retry: 'Bandyti dar kartą',

  // Bendri
  loading: 'Įkeliama…',
  unexpectedError: 'Įvyko netikėta klaida. Bandykite dar kartą.',
};
