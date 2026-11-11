import { useSearchParams } from 'react-router-dom';
import { Notice } from '../components/common';
import { t } from '../messages';

// 1 ekranas – prisijungimas (NI-1, FR-01). Slaptažodžio lauko nėra.
export function LoginPage() {
  const [params] = useSearchParams();
  const failed = params.get('klaida') === 'AUTH_FAILED';

  return (
    <main className="page login">
      <h1>{t.appName}</h1>
      <p className="lead">{t.loginTitle}</p>

      {failed && <Notice kind="error">{t.loginFailed}</Notice>}

      {/* Paprasta nuoroda: naršyklė pereina į serverį, o šis nukreipia į Steam */}
      <a className="button steam" href="/auth/steam">
        {t.loginButton}
      </a>
      <p className="muted">{t.loginHint}</p>
      <p className="muted small">{t.privacyNote}</p>
    </main>
  );
}
