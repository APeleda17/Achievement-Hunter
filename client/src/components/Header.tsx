import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { t } from '../messages';

export function Header() {
  const { me, logout } = useAuth();

  return (
    <header className="header">
      <Link to="/" className="brand">
        {t.appName}
      </Link>
      {me && (
        <div className="user">
          {me.avatarUrl && <img className="avatar" src={me.avatarUrl} alt="" width={32} height={32} />}
          <span className="user-name">{me.personaName}</span>
          <button type="button" className="button secondary" onClick={() => void logout()}>
            {t.logout}
          </button>
        </div>
      )}
    </header>
  );
}
