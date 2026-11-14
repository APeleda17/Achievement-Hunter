import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { t } from '../messages';
import { formatDateTime, formatPercent } from '../format';
import type { Plan, PlanItem } from '../types';
import { ErrorState, Loading, Notice, ProgressBar } from '../components/common';


type State = { kind: 'loading' } | { kind: 'ready'; plan: Plan } | { kind: 'error'; message: string };

export function PlanPage() {
  const { logout } = useAuth();
  const planId = Number(useParams().planId);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [saving, setSaving] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) return void logout();
    if (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      return setState({ kind: 'error', message: t.planNotFound });
    }
    setState({ kind: 'error', message: t.unexpectedError });
  }, [logout]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', plan: await api.getPlan(planId) });
    } catch (error) {
      handleError(error);
    }
  }, [planId, handleError]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(item: PlanItem) {
    setSaving(item.id);
    setNotice(null);
    try {
      const plan = await api.setPlanItemStatus(planId, item.id, item.status === 'ATLIKTAS' ? 'NEATLIKTAS' : 'ATLIKTAS');
      setState({ kind: 'ready', plan });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return void logout();
      setNotice(t.unexpectedError);
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page">
      <Link to="/planai" className="back-link">{t.backToPlans}</Link>
      {state.kind === 'loading' && <Loading />}
      {state.kind === 'error' && <ErrorState message={state.message} onRetry={() => void load()} />}
      {state.kind === 'ready' && <PlanView plan={state.plan} saving={saving} notice={notice} onToggle={(item) => void toggle(item)} />}
    </main>
  );
}

function PlanView({ plan, saving, notice, onToggle }: {
  plan: Plan; saving: number | null; notice: string | null; onToggle: (item: PlanItem) => void;
}) {
  const { criteria } = plan;
  return (
    <>
      <h1>{t.planTitle(plan.gameName)}</h1>
      <p className="muted small">
        {t.planCreatedAt(formatDateTime(plan.createdAt))} · <Link to={`/zaidimai/${plan.appId}`}>{t.openGame}</Link>
      </p>

      <section className="summary" aria-label={t.planCriteria}>
        <p className="summary-text">
          {t.planProgress(plan.progress.done, plan.progress.total)} ({formatPercent(plan.progress.percent)})
        </p>
        <ProgressBar percent={plan.progress.percent} />
        <p className="muted small">
          {t.planTotal(plan.totalMinutes, criteria.availableMinutes)}
          {criteria.desiredDifficulty && ` · ${t.planDifficulty}: ${t.difficultyLabel[criteria.desiredDifficulty]}`}
          {criteria.achievementType && ` · ${t.planType}: ${t.typeLabel[criteria.achievementType]}`}
        </p>
      </section>

      <p className="small"><span className="ai-label">{t.generatedByAi}</span> <span className="muted">{t.planDisclaimer} {t.planAutoDoneHint}</span></p>
      {notice && <Notice kind="error">{notice}</Notice>}

      <ol className="achievement-list plan-items">
        {plan.items.map((item) => (
          <li key={item.id} className={`achievement ${item.status === 'ATLIKTAS' ? 'is-unlocked' : 'is-locked'}`}>
            <input type="checkbox" className="plan-check" checked={item.status === 'ATLIKTAS'} disabled={saving !== null}
              aria-label={t.planItemDone(item.name)} onChange={() => onToggle(item)} />
            <div className="achievement-body">
              <p className="achievement-name">{item.position}. {item.name}</p>
              {item.description && <p className="muted small">{item.description}</p>}
              <p className="small">{item.justification}</p>
              {item.completedAt && <p className="muted small">{t.planItemDoneAt(formatDateTime(item.completedAt))}</p>}
            </div>
            <span className="badge badge-locked">{t.planItemMinutes(item.estimatedMinutes)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}