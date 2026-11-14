import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { waitForJob, type JobPhase } from '../aiJob';
import { t } from '../messages';
import { ACHIEVEMENT_TYPES, DIFFICULTIES, type AchievementType, type Difficulty } from '../types';


type State = { kind: 'idle' } | { kind: JobPhase } | { kind: 'error'; message: string };

function errorText(code: string) {
  switch (code) {
    case 'NO_CANDIDATES': return t.planNoCandidates;
    case 'AI_UNAVAILABLE': return t.aiUnavailable;
    case 'AI_INVALID_RESPONSE': return t.planInvalid;
    case 'AI_JOB_TIMEOUT': return t.planTimeout;
    case 'AI_QUEUE_FULL': return t.aiQueueFull;
    case 'VALIDATION_ERROR': return t.planMinutesInvalid;
    case 'NOT_FOUND': return t.planExpired;
    default: return t.unexpectedError;
  }
}

export function parseMinutes(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const minutes = Number(value.trim());
  return minutes >= 15 && minutes <= 600 ? minutes : null;
}

export function PlanForm({ appId, onUnauthorized }: { appId: number; onUnauthorized?: () => void }) {
  const navigate = useNavigate();
  const [minutes, setMinutes] = useState('60');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [type, setType] = useState<AchievementType | ''>('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const current = useRef<AbortController | null>(null);
  const busy = state.kind === 'waiting' || state.kind === 'generating';
  const parsedMinutes = parseMinutes(minutes);

  useEffect(() => () => { current.current?.abort(); current.current = null; }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (current.current) return;
    if (parsedMinutes === null) { setState({ kind: 'error', message: t.planMinutesInvalid }); return; }
    const controller = new AbortController();
    current.current = controller;
    setState({ kind: 'waiting' });
    try {
      const accepted = await api.createPlan({
        appId, availableMinutes: parsedMinutes, ...(difficulty ? { difficulty } : {}), ...(type ? { type } : {}),
      }, controller.signal);
      const plan = await waitForJob(accepted.jobId, api.getPlanJob, controller.signal, (phase) => setState({ kind: phase }));
      if (controller.signal.aborted) return;
      navigate(`/planai/${plan.id}`);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { onUnauthorized?.(); return; }
      setState({ kind: 'error', message: errorText(error instanceof ApiError ? error.code : 'INTERNAL_ERROR') });
    } finally {
      if (current.current === controller) current.current = null;
    }
  }

  return (
    <section className="plan-form" aria-label={t.planFormTitle}>
      <h2>{t.planFormTitle}</h2>
      <p className="muted small">{t.planFormHint}</p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="filters">
          <label>
            <span>{t.planMinutes}</span>
            <input type="number" inputMode="numeric" min={15} max={600} step={1} value={minutes} disabled={busy}
              aria-invalid={parsedMinutes === null} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label>
            <span>{t.planDifficulty}</span>
            <select value={difficulty} disabled={busy} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}>
              <option value="">{t.planAny}</option>
              {DIFFICULTIES.map((value) => <option key={value} value={value}>{t.difficultyLabel[value]}</option>)}
            </select>
          </label>
          <label>
            <span>{t.planType}</span>
            <select value={type} disabled={busy} onChange={(e) => setType(e.target.value as AchievementType | '')}>
              <option value="">{t.planAny}</option>
              {ACHIEVEMENT_TYPES.map((value) => <option key={value} value={value}>{t.typeLabel[value]}</option>)}
            </select>
          </label>
          <button type="submit" className="button" disabled={busy || parsedMinutes === null}>{t.planSubmit}</button>
        </div>
        {parsedMinutes === null && <p className="ai-error small">{t.planMinutesInvalid}</p>}
      </form>
      <div aria-live="polite" aria-atomic="true">
        {busy && <p role="status" className="muted small">{state.kind === 'waiting' ? t.planWaiting : t.planGenerating}</p>}
        {state.kind === 'error' && <p role="alert" className="ai-error small">{state.message}</p>}
      </div>
    </section>
  );
}