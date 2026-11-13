import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { t } from '../messages';
import { formatDateTime } from '../format';
import type { Guide } from '../types';

type State = { kind: 'idle' } | { kind: 'waiting' | 'generating' } | { kind: 'ready'; result: Guide } | { kind: 'error'; message: string };

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
    case 'NO_RELIABLE_INFO': return t.guideNoInfo;
    case 'SOURCES_UNAVAILABLE': return t.guideSourcesUnavailable;
    case 'AI_UNAVAILABLE': return t.aiUnavailable;
    case 'AI_INVALID_RESPONSE': return t.guideInvalid;
    case 'AI_JOB_TIMEOUT': return t.guideTimeout;
    case 'AI_QUEUE_FULL': return t.aiQueueFull;
    case 'SOURCE_CHANGED': return t.aiSourceChanged;
    case 'NOT_FOUND': return t.guideExpired;
    default: return t.unexpectedError;
  }
}

export function AchievementGuide({ appId, apiName, name, description, onUnauthorized }: {
  appId: number; apiName: string; name: string; description: string | null; onUnauthorized?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const current = useRef<AbortController | null>(null);
  const busy = state.kind === 'waiting' || state.kind === 'generating';
  useEffect(() => {
    setState({ kind: 'idle' });
    return () => { current.current?.abort(); current.current = null; };
  }, [appId, apiName, name, description]);

  async function generate() {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setState({ kind: 'waiting' });
    try {
      const answer = await api.guide(appId, apiName, controller.signal);
      if (controller.signal.aborted) return;
      if (!('jobId' in answer)) { setState({ kind: 'ready', result: answer }); return; }
      setState({ kind: answer.status === 'VYKDOMA' ? 'generating' : 'waiting' });
      while (!controller.signal.aborted) {
        await waitForPoll(controller.signal);
        const job = await api.getGuideJob(answer.jobId, controller.signal);
        if (controller.signal.aborted) return;
        if (job.status === 'BAIGTA') { setState({ kind: 'ready', result: job.result }); return; }
        if (job.status === 'KLAIDA') throw new ApiError(502, job.error.code);
        setState({ kind: job.status === 'VYKDOMA' ? 'generating' : 'waiting' });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { onUnauthorized?.(); return; }
      setState({ kind: 'error', message: errorText(error instanceof ApiError ? error.code : 'INTERNAL_ERROR') });
    } finally { if (current.current === controller) current.current = null; }
  }

  return (
    <section className="achievement-guide" aria-label={t.guideRegion(name)}>
      <button type="button" className="button secondary" disabled={busy} aria-label={t.guideAction(name)} onClick={() => void generate()}>{t.guide}</button>
      <div aria-live="polite" aria-atomic="true">
        {busy && <p role="status" className="muted small">{state.kind === 'waiting' ? t.guideWaiting : t.guideGenerating}</p>}
        {state.kind === 'error' && <p role="alert" className="ai-error small">{state.message}</p>}
        {state.kind === 'ready' && (
          <div className="ai-guide">
            <p className="ai-label">{t.generatedByAi}</p>
            <ol className="guide-steps">{state.result.steps.map((step, index) => (
              <li key={index}>{step.instruction}{' '}
                <span className="guide-citations">{step.sourceIds.map((id) => {
                  const position = state.result.sources.findIndex((source) => source.id === id);
                  const source = state.result.sources[position];
                  return source && <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" aria-label={source.title}>[{position + 1}]</a>;
                })}</span>
              </li>
            ))}</ol>
            <p className="muted small">{t.guideDisclaimer}</p>
            <p className="muted small">{t.aiGeneratedAt(formatDateTime(state.result.generatedAt))}</p>
            <h3 className="small">{t.guideSources}</h3>
            <ol className="guide-sources">{state.result.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                <p className="muted small">{t.sourceFetchedAt(formatDateTime(source.fetchedAt))}</p>
              </li>
            ))}</ol>
          </div>
        )}
      </div>
    </section>
  );
}
