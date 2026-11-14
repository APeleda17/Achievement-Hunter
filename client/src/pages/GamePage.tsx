import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { t } from '../messages';
import { formatDateTime, formatProgress } from '../format';
import type { AchievementQuery, GameAchievements } from '../types';
import { AchievementRedo } from '../components/AchievementRedo';
import { AchievementGuide } from '../components/AchievementGuide';
import { AchievementHelp } from '../components/AchievementHelp';
import { AchievementAssessment } from '../components/AchievementAssessment';
import { AchievementFilters, hasActiveFilters } from '../components/AchievementFilters';
import { PlanForm } from '../components/PlanForm';
import { createSerialQueue, type SerialQueue } from '../aiJob';
import {ErrorState,Loading,Notice,PrivateProfileHelp,ProgressBar,RefreshBar,type NoticeKind,} from '../components/common';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GameAchievements }
  | { kind: 'private' }
  | { kind: 'error'; message: string };

// 3 ekranas – žaidimo pasiekimai ir progresas (NI-7).
export function GamePage() {
  const { logout } = useAuth();
  const appId = Number(useParams().appId);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  // NI-10, NI-11: filtrai ir rūšiavimas; keičiant juos ekranas neperpiešiamas iš naujo
  const [query, setQuery] = useState<AchievementQuery>({});
  const [filtering, setFiltering] = useState(false);
  const shownAppId = useRef<number | null>(null);
  const assessQueue = useMemo(() => createSerialQueue(), [appId]);

  const handleError = useCallback(
    (err: unknown, hasDataOnScreen: boolean) => {
      if (err instanceof ApiError) {
        if (err.status === 401) return void logout();
        if (err.code === 'PROFILE_PRIVATE') return setState({ kind: 'private' });
        if (err.code === 'SYNC_IN_PROGRESS') return setNotice({ kind: 'info', text: t.syncInProgress });
        if (err.code === 'NOT_FOUND' || err.code === 'VALIDATION_ERROR') {
          return setState({ kind: 'error', message: t.gameNotFound });
        }
        if (err.code === 'STEAM_UNAVAILABLE' && hasDataOnScreen) {
          return setNotice({ kind: 'warning', text: t.showingCached }); // FR-12
        }
        if (err.code === 'STEAM_UNAVAILABLE') return setState({ kind: 'error', message: t.noData }); // FR-13
      }
      if (hasDataOnScreen) return setNotice({ kind: 'error', text: t.unexpectedError });
      setState({ kind: 'error', message: t.unexpectedError });
    },
    [logout],
  );

  // Kiekviena užklausa gauna numerį; atsakymai iš senesnių užklausų ignoruojami
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    // To paties žaidimo duomenys jau rodomi – keičiant filtrus jų nenuimame
    const keepScreen = shownAppId.current === appId;
    if (keepScreen) setFiltering(true);
    else setState({ kind: 'loading' });
    try {
      const data = await api.getAchievements(appId, query);
      if (id === requestId.current) {
        shownAppId.current = appId;
        setState({ kind: 'ready', data });
      }
    } catch (err) {
      if (id !== requestId.current) return;
      // Pirmas atidarymas jau sinchronizuojamas kitoje užklausoje – pabandome po sekundės
      if (err instanceof ApiError && err.code === 'SYNC_IN_PROGRESS') {
        setTimeout(() => {
          if (id === requestId.current) void load();
        }, 1000);
        return;
      }
      if (keepScreen && err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setNotice({ kind: 'warning', text: t.filtersInvalid });
        return;
      }
      handleError(err, keepScreen);
    } finally {
      if (id === requestId.current) setFiltering(false);
    }
  }, [appId, query, handleError]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current++; // išeinant iš ekrano senų atsakymų nebereikia
    };
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    try {
      const data = await api.syncGame(appId);
      // Atnaujinimas grąžina nefiltruotą sąrašą – su filtrais jį įkeliame iš naujo
      if (hasActiveFilters(query)) await load();
      else setState({ kind: 'ready', data });
      setNotice({ kind: 'success', text: t.refreshDone });
    } catch (err) {
      handleError(err, state.kind === 'ready');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="page">
      <Link to="/" className="back-link">
        {t.backToLibrary}
      </Link>

      {state.kind === 'loading' && <Loading />}
      {state.kind === 'private' && <PrivateProfileHelp />}
      {state.kind === 'error' && <ErrorState message={state.message} onRetry={() => void load()} />}
      {state.kind === 'ready' && (
        <>
          <h1>{state.data.name}</h1>
          <RefreshBar
            lastSyncedAt={state.data.lastSyncedAt}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
          />
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
          <AchievementsView data={state.data} query={query} onQueryChange={setQuery} filtering={filtering}
            assessQueue={assessQueue} onUnauthorized={() => void logout()} />
        </>
      )}
    </main>
  );
}

function AchievementsView({ data, query, onQueryChange, filtering, assessQueue, onUnauthorized }: {
  data: GameAchievements; query: AchievementQuery; onQueryChange: (query: AchievementQuery) => void;
  filtering: boolean; assessQueue: SerialQueue; onUnauthorized: () => void;
}) {
  // FR-09: be pasiekimų – atskiras pranešimas, ne 0 %
  if (!data.hasAchievements || !data.progress) {
    return <p className="empty">{t.noAchievements}</p>;
  }

  const { unlocked, total, percent } = data.progress;
  return (
    <>
      <section className="summary" aria-label={t.achievementsTitle}>
        <p className="summary-text">{formatProgress(unlocked, total, percent)}</p>
        <ProgressBar percent={percent} />
        <p className="small"><Link to="/planai">{t.plansTitle}</Link></p>
      </section>

      {allUnlocked(unlocked, total) ? null : <PlanForm appId={data.appId} onUnauthorized={onUnauthorized} />}

      <h2>{t.achievementsTitle}</h2>
      <AchievementFilters query={query} onChange={onQueryChange} disabled={filtering} />
      <p className="muted small">{t.filtersHint}</p>
      {filtering && <Loading />}
      {data.achievements.length === 0 && data.filtered && (
        <div className="empty">
          <p>{t.filtersEmpty}</p>
          <button type="button" className="button secondary" onClick={() => onQueryChange({})}>{t.clearFilters}</button>
        </div>
      )}
      <ul className="achievement-list">
        {data.achievements.map((a) => (
          <li key={a.apiName} className={`achievement ${a.unlocked ? 'is-unlocked' : 'is-locked'}`}>
            {a.iconUrl ? (
              <img className="achievement-icon" src={a.iconUrl} alt="" width={48} height={48} />
            ) : (
              <span className="achievement-icon placeholder" aria-hidden="true" />
            )}
            <div className="achievement-body">
              <p className="achievement-name">{a.name}</p>
              {a.description && <p className="muted small">{a.description}</p>}
              {a.unlocked && a.unlockedAt && <p className="muted small">{t.unlockedOn(formatDateTime(a.unlockedAt))}</p>}
              <AchievementAssessment key={`assess:${data.appId}:${a.apiName}`} appId={data.appId} achievement={a} queue={assessQueue} onUnauthorized={onUnauthorized} />
              <AchievementRedo key={`${data.appId}:${a.apiName}`} appId={data.appId} apiName={a.apiName}
                name={a.name} description={a.description} onUnauthorized={onUnauthorized} />
              <AchievementGuide appId={data.appId} apiName={a.apiName} name={a.name}
                description={a.description} onUnauthorized={onUnauthorized} />
              <AchievementHelp appId={data.appId} apiName={a.apiName} name={a.name}
                description={a.description} onUnauthorized={onUnauthorized} />
            </div>
            <span className={`badge ${a.unlocked ? 'badge-unlocked' : 'badge-locked'}`}>
              {a.unlocked ? t.unlocked : t.locked}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Visi pasiekimai jau atrakinti – planui kandidatų nebus, formos nerodome */
function allUnlocked(unlocked: number, total: number) {
  return unlocked >= total;
}