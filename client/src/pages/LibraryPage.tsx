import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { t } from '../messages';
import { formatProgress } from '../format';
import type { Library, LibraryGame } from '../types';
import {
  ErrorState,
  Loading,
  Notice,
  PrivateProfileHelp,
  ProgressBar,
  RefreshBar,
  type NoticeKind,
} from '../components/common';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; library: Library }
  | { kind: 'private' }
  | { kind: 'error'; message: string };

const SEARCH_DELAY_MS = 300;

// 2 ekranas – žaidimų biblioteka (NI-6, NI-8).
export function LibraryPage() {
  const { me, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);

  /** Klaidą paverčia ekrano būsena arba pranešimu. */
  const handleError = useCallback(
    (err: unknown, hasDataOnScreen: boolean) => {
      if (err instanceof ApiError) {
        if (err.status === 401) return void logout();
        if (err.code === 'PROFILE_PRIVATE') return setState({ kind: 'private' });
        if (err.code === 'SYNC_IN_PROGRESS') return setNotice({ kind: 'info', text: t.syncInProgress });
        if (err.code === 'STEAM_UNAVAILABLE' && hasDataOnScreen) {
          // FR-12: rodome išsaugotus duomenis ir informuojame
          return setNotice({ kind: 'warning', text: t.showingCached });
        }
      }
      if (hasDataOnScreen) return setNotice({ kind: 'error', text: t.unexpectedError });
      // FR-13: duomenų nėra – klaidos būsena, ne tuščias sąrašas
      const message = err instanceof ApiError && err.code === 'STEAM_UNAVAILABLE' ? t.noData : t.unexpectedError;
      setState({ kind: 'error', message });
    },
    [logout],
  );

  // Kiekviena užklausa gauna numerį; vėluojantis senos paieškos atsakymas neperrašo naujesnio
  const requestId = useRef(0);

  const load = useCallback(
    async (query: string) => {
      const id = ++requestId.current;
      try {
        const library = await api.getLibrary(query.trim());
        if (id === requestId.current) setState({ kind: 'ready', library });
      } catch (err) {
        if (id === requestId.current) handleError(err, false);
      }
    },
    [handleError],
  );

  // Paieška vykdoma šiek tiek palaukus po paskutinio klavišo paspaudimo
  useEffect(() => {
    const timer = setTimeout(() => void load(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    try {
      await api.syncLibrary();
      await load(search); // perkrauname su ta pačia paieška
      setNotice({ kind: 'success', text: t.refreshDone });
    } catch (err) {
      handleError(err, state.kind === 'ready');
    } finally {
      setRefreshing(false);
    }
  }

  function retry() {
    setState({ kind: 'loading' });
    void load(search);
  }

  return (
    <main className="page">
      <h1>{t.libraryTitle}</h1>

      {me?.profilePrivate && state.kind !== 'private' && <PrivateProfileHelp />}

      <div className="toolbar">
        <label className="search">
          <span className="visually-hidden">{t.searchLabel}</span>
          <input
            type="search"
            value={search}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchLabel}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <RefreshBar
          lastSyncedAt={state.kind === 'ready' ? state.library.lastSyncedAt : null}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      </div>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {state.kind === 'loading' && <Loading />}
      {state.kind === 'private' && <PrivateProfileHelp />}
      {state.kind === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.kind === 'ready' && <GameList games={state.library.games} searching={search.trim() !== ''} />}
    </main>
  );
}

function GameList({ games, searching }: { games: LibraryGame[]; searching: boolean }) {
  if (games.length === 0) {
    return <p className="empty">{searching ? t.searchEmpty : t.libraryEmpty}</p>;
  }
  return (
    <>
      <p className="muted small">{t.gamesCount(games.length)}</p>
      <ul className="game-list">
        {games.map((game) => (
          <li key={game.appId}>
            <Link to={`/zaidimai/${game.appId}`} className="game-row">
              {game.iconUrl ? (
                <img className="game-icon" src={game.iconUrl} alt="" width={32} height={32} />
              ) : (
                <span className="game-icon placeholder" aria-hidden="true" />
              )}
              <span className="game-name">{game.name}</span>
              <GameProgress game={game} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function GameProgress({ game }: { game: LibraryGame }) {
  if (game.hasAchievements === null) {
    return <span className="game-progress muted small">{t.progressUnknown}</span>;
  }
  if (game.hasAchievements === false || game.progressPercent === null) {
    return <span className="game-progress muted small">{t.noAchievements}</span>;
  }
  return (
    <span className="game-progress">
      <span>{formatProgress(game.unlockedCount!, game.totalCount!, game.progressPercent)}</span>
      <ProgressBar percent={game.progressPercent} />
    </span>
  );
}
