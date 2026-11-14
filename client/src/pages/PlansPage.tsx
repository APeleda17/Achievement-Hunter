import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { t } from '../messages';
import { formatDateTime, formatPercent } from '../format';
import type { PlanSummary } from '../types';
import { ErrorState, Loading, ProgressBar } from '../components/common';


type State = { kind: 'loading' } | { kind: 'ready'; plans: PlanSummary[] } | { kind: 'error' };

export function PlansPage() {
  const { logout } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', plans: (await api.getPlans()).plans });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return void logout();
      setState({ kind: 'error' });
    }
  }, [logout]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="page">
      <Link to="/" className="back-link">{t.backToLibrary}</Link>
      <h1>{t.plansTitle}</h1>
      {state.kind === 'loading' && <Loading />}
      {state.kind === 'error' && <ErrorState message={t.unexpectedError} onRetry={() => void load()} />}
      {state.kind === 'ready' && state.plans.length === 0 && <p className="empty">{t.plansEmpty}</p>}
      {state.kind === 'ready' && state.plans.length > 0 && (
        <ul className="game-list">
          {state.plans.map((plan) => (
            <li key={plan.id}>
              <Link to={`/planai/${plan.id}`} className="game-row plan-row">
                <span>
                  <span className="game-name">{plan.gameName}</span>
                  <span className="muted small"> · {t.planCreatedAt(formatDateTime(plan.createdAt))} · {plan.totalMinutes} min.</span>
                </span>
                <span className="game-progress">
                  <span className="small">{t.planProgress(plan.progress.done, plan.progress.total)} ({formatPercent(plan.progress.percent)})</span>
                  <ProgressBar percent={plan.progress.percent} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}