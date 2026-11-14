import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { waitForJob, type JobPhase, type SerialQueue } from '../aiJob';
import { t } from '../messages';
import { formatPercent } from '../format';
import type { Achievement, AvailabilityAssessment } from '../types';

// NI-9, GVS-14: pasiekimo prieinamumas, sunkumas, tipas ir retumas + „Įvertinti“ (U11).

type State = { kind: 'idle' } | { kind: 'queued' } | { kind: JobPhase } | { kind: 'error'; message: string };

function errorText(code: string) {
  switch (code) {
    case 'AI_UNAVAILABLE': return t.aiUnavailable;
    case 'AI_JOB_TIMEOUT': return t.aiTimeout;
    case 'AI_QUEUE_FULL': return t.aiQueueFull;
    case 'NOT_FOUND': return t.assessExpired;
    default: return t.unexpectedError;
  }
}

export function AchievementAssessment({ appId, achievement, queue, onUnauthorized }: {
  appId: number; achievement: Achievement;
  /** PRI-02: jei perduota – neįvertintas neatrakintas pasiekimas įvertinamas automatiškai šioje eilėje */
  queue?: SerialQueue;
  onUnauthorized?: () => void;
}) {
  const [assessment, setAssessment] = useState<Pick<AvailabilityAssessment, 'availability' | 'difficulty' | 'achievementType' | 'reason'> | null>(
    achievement.availability
      ? { availability: achievement.availability, difficulty: achievement.difficulty, achievementType: achievement.achievementType, reason: achievement.availabilityReason ?? '' }
      : null,
  );
  const [state, setState] = useState<State>({ kind: 'idle' });
  const current = useRef<AbortController | null>(null);
  const busy = state.kind === 'queued' || state.kind === 'waiting' || state.kind === 'generating';
  const needsAssessment = !assessment ;

  useEffect(() => () => { current.current?.abort(); current.current = null; }, []);

  // PRI-02: atidarius žaidimą neįvertinti neatrakinti pasiekimai įvertinami automatiškai, po vieną
  useEffect(() => {
    if (queue && needsAssessment && !queue.halted) start(queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  /** Be eilės – iš karto (mygtukas); su eile – kai ateis eilė (automatiškai) */
  function start(serial?: SerialQueue) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setState({ kind: serial ? 'queued' : 'waiting' });
    const task = () => (controller.signal.aborted ? Promise.resolve() : assess(controller, serial));
    (serial ? serial.run(task) : task()).catch(() => {
      // Eilė sustabdyta (DI nepasiekiamas) – lieka mygtukas „Įvertinti“
      if (current.current === controller) current.current = null;
      if (!controller.signal.aborted) setState({ kind: 'idle' });
    });
  }

  async function assess(controller: AbortController, serial?: SerialQueue) {
    setState({ kind: 'waiting' });
    try {
      const answer = await api.assessAvailability(appId, achievement.apiName, controller.signal);
      const result = 'jobId' in answer
        ? await waitForJob(answer.jobId, api.getAvailabilityJob, controller.signal, (phase) => setState({ kind: phase }))
        : answer;
      if (controller.signal.aborted) return;
      setAssessment(result);
      setState({ kind: 'idle' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { serial?.halt(); onUnauthorized?.(); return; }
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      // DI nepasiekiamas ar perkrautas – kitų automatiškai nebevertiname
      if (code === 'AI_UNAVAILABLE' || code === 'AI_QUEUE_FULL') serial?.halt();
      setState({ kind: 'error', message: errorText(code) });
    } finally {
      if (current.current === controller) current.current = null;
    }
  }

  const unavailable = assessment?.availability === 'NEPRIEINAMAS';

  return (
    <section className="achievement-assessment" aria-label={t.assessRegion(achievement.name)}>
      <div className="tags">
        {assessment ? (
          <>
            <span className={`tag tag-${assessment.availability.toLowerCase()}`}>{t.availabilityLabel[assessment.availability]}</span>
            {assessment.difficulty && <span className="tag">{t.difficultyLabel[assessment.difficulty]}</span>}
            {assessment.achievementType && <span className="tag">{t.typeLabel[assessment.achievementType] ?? assessment.achievementType}</span>}
          </>
        ) : (
          <span className="tag tag-muted">{t.notAssessed}</span>
        )}
        {achievement.rarityPercent !== null && <span className="tag tag-muted">{t.rarity(formatPercent(achievement.rarityPercent))}</span>}
        {needsAssessment && (
          <button type="button" className="button secondary small-button" disabled={busy}
            aria-label={t.assessAction(achievement.name)} onClick={() => start()}>
            {t.assess}
          </button>
        )}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {busy && (
          <p role="status" className="muted small">
            {state.kind === 'queued' ? t.assessQueued : state.kind === 'waiting' ? t.assessWaiting : t.assessGenerating}
          </p>
        )}
        {state.kind === 'error' && <p role="alert" className="ai-error small">{state.message}</p>}
        {assessment?.reason && (
          <p className="muted small">
            <span className="ai-label">{t.generatedByAi}</span> {assessment.reason}
          </p>
        )}
        {unavailable && <p className="small ai-error">{t.unavailableHint}</p>}
      </div>
    </section>
  );
}