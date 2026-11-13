import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { t } from '../messages';
import { formatDateTime } from '../format';
import type { Explanation } from '../types';

type State = { kind: 'idle' } | { kind: 'waiting' | 'generating' } | { kind: 'ready'; result: Explanation } | { kind: 'error'; message: string };

function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function errorText(code: string) {
  switch (code) {
    case 'AI_UNAVAILABLE': return t.aiUnavailable;
    case 'AI_INVALID_RESPONSE': return t.aiInvalidResponse;
    case 'AI_JOB_TIMEOUT': return t.aiTimeout;
    case 'AI_QUEUE_FULL': return t.aiQueueFull;
    case 'NO_DESCRIPTION': return t.aiNoDescription;
    case 'SOURCE_CHANGED': return t.aiSourceChanged;
    case 'NOT_FOUND': return t.aiJobExpired;
    default: return t.unexpectedError;
  }
}

export function AchievementRedo({ appId, apiName, name, description, onUnauthorized }: {
  appId: number; apiName: string; name: string; description: string | null; onUnauthorized?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const current = useRef<AbortController | null>(null);
  const busy = state.kind === 'waiting' || state.kind === 'generating';
  const hasDescription = [...(description?.trim().normalize('NFC') ?? '')].length >= 2;

  useEffect(() => {
    setState({ kind: 'idle' });
    return () => { current.current?.abort(); current.current = null; };
  }, [appId, apiName, description]);

  async function explain() {
    if (current.current || !hasDescription) return;
    const controller = new AbortController();
    current.current = controller;
    setState({ kind: 'waiting' });
    try {
      const answer = await api.explain(appId, apiName, controller.signal);
      if (controller.signal.aborted) return;
      if (!('jobId' in answer)) { setState({ kind: 'ready', result: answer }); return; }
      setState({ kind: answer.status === 'VYKDOMA' ? 'generating' : 'waiting' });
      while (!controller.signal.aborted) {
        await waitForPoll(controller.signal);
        const job = await api.getAiJob(answer.jobId, controller.signal);
        if (controller.signal.aborted) return;
        if (job.status === 'BAIGTA') { setState({ kind: 'ready', result: job.result }); return; }
        if (job.status === 'KLAIDA') throw new ApiError(502, job.error.code);
        setState({ kind: job.status === 'VYKDOMA' ? 'generating' : 'waiting' });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { onUnauthorized?.(); return; }
      setState({ kind: 'error', message: errorText(error instanceof ApiError ? error.code : 'INTERNAL_ERROR') });
    } finally {
      if (current.current === controller) current.current = null;
    }
  }

  return (
    <section className="achievement-redo" aria-label={t.explanationRegion(name)}>
      <button type="button" className="button secondary explain-button" disabled={busy || !hasDescription}
        aria-label={t.explainAction(name)} onClick={() => void explain()}>
        {t.explain}
      </button>
      {!hasDescription && <p className="muted small">{t.aiNoDescription}</p>}
      <div aria-live="polite" aria-atomic="true">
        {busy && <p role="status" className="muted small">{state.kind === 'waiting' ? t.explanationWaiting : t.explanationGenerating}</p>}
        {state.kind === 'error' && <p role="alert" className="ai-error small">{state.message}</p>}
        {state.kind === 'ready' && (
          <div className="ai-explanation">
            <p className="ai-label">{t.generatedByAi}</p>
            <p className="ai-explanation-text">{state.result.text}</p>
            <p className="muted small">{t.aiDisclaimer}</p>
            <p className="muted small">{t.aiGeneratedAt(formatDateTime(state.result.generatedAt))}</p>
          </div>
        )}
      </div>
    </section>
  );
}
