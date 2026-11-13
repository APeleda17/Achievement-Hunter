import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { t } from '../messages';
import { formatDateTime } from '../format';
import type { HelpAnswer } from '../types';

type State = { kind: 'idle' } | { kind: 'waiting' | 'generating' } | { kind: 'ready'; answer: HelpAnswer } | { kind: 'error'; text: string };
const normalize = (value: string) => value.normalize('NFC').trim();
const count = (value: string) => [...normalize(value)].length;
function message(code: string) {
  switch (code) {
    case 'VALIDATION_ERROR': return t.stuckInvalid;
    case 'NO_RELIABLE_INFO': return t.stuckNoInfo;
    case 'SOURCES_UNAVAILABLE': return t.guideSourcesUnavailable;
    case 'AI_UNAVAILABLE': return t.aiUnavailable;
    case 'AI_QUEUE_FULL': return t.aiQueueFull;
    case 'SOURCE_CHANGED': return t.aiSourceChanged;
    case 'AI_JOB_TIMEOUT': return t.stuckTimeout;
    case 'NOT_FOUND': return t.stuckExpired;
    case 'AI_INVALID_RESPONSE': return t.stuckInvalidAnswer;
    default: return t.unexpectedError;
  }
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function AchievementHelp({ appId, apiName, name, description, onUnauthorized }: {
  appId: number; apiName: string; name: string; description: string | null; onUnauthorized?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [history, setHistory] = useState<HelpAnswer[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const current = useRef<AbortController | null>(null);
  const busy = state.kind === 'waiting' || state.kind === 'generating';
  const length = count(problem);
  const valid = length >= 1 && length <= 500;
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  useEffect(() => {
    setOpen(false); setProblem(''); setState({ kind: 'idle' }); setHistory([]); setHistoryError(false);
    return () => { current.current?.abort(); current.current = null; };
  }, [appId, apiName, name, description]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void api.getHelpHistory(appId, apiName, controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        setHistory((previous) => [...new Map([...data.requests, ...previous].map((answer) => [answer.id, answer])).values()]
          .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt) || b.id - a.id).slice(0, 10));
        setHistoryError(false);
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) unauthorized.current?.();
      else setHistoryError(true);
    });
    return () => controller.abort();
  }, [open, appId, apiName, description]);

  function ready(answer: HelpAnswer) {
    setState({ kind: 'ready', answer });
    setHistory((previous) => [answer, ...previous.filter((item) => item.id !== answer.id)].slice(0, 10));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (current.current || !valid) return;
    const controller = new AbortController();
    current.current = controller;
    setState({ kind: 'waiting' });
    try {
      const answer = await api.help(appId, apiName, normalize(problem), controller.signal);
      if (controller.signal.aborted) return;
      if (!('jobId' in answer)) { ready(answer); return; }
      while (!controller.signal.aborted) {
        await pause(controller.signal);
        const job = await api.getHelpJob(answer.jobId, controller.signal);
        if (controller.signal.aborted) return;
        if (job.status === 'BAIGTA') { ready(job.result); return; }
        if (job.status === 'KLAIDA') throw new ApiError(502, job.error.code);
        setState({ kind: job.status === 'VYKDOMA' ? 'generating' : 'waiting' });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { unauthorized.current?.(); return; }
      setState({ kind: 'error', text: message(error instanceof ApiError ? error.code : 'INTERNAL_ERROR') });
    } finally { if (current.current === controller) current.current = null; }
  }
  const citations = (ids: number[], answer: HelpAnswer) => <span className="guide-citations">{ids.map((sourceId) => {
    const index = answer.sources.findIndex((source) => source.id === sourceId);
    const source = answer.sources[index];
    return source && <a key={sourceId} href={source.url} target="_blank" rel="noopener noreferrer" aria-label={source.title}>[{index + 1}]</a>;
  })}</span>;
  return <section className="achievement-help" aria-label={t.stuckAction(name)}>
    <button type="button" className="button secondary" aria-expanded={open} aria-controls={id} onClick={() => {
      if (open) { current.current?.abort(); current.current = null; if (busy) setState({ kind: 'idle' }); }
      setOpen(!open);
    }}>{t.stuck}</button>
    {open && <div id={id} className="help-panel">
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor={`${id}-problem`}>{t.stuckProblem}</label>
        <textarea id={`${id}-problem`} rows={3} value={problem} disabled={busy}
          aria-invalid={length > 500} aria-describedby={`${id}-hint ${id}-count`} onChange={(event) => setProblem(event.target.value)} />
        <p id={`${id}-hint`} className="muted small">{t.stuckHint}</p>
        <p id={`${id}-count`} className={length > 500 ? 'ai-error small' : 'muted small'}>{length}/500</p>
        {length > 500 && <p role="alert" className="ai-error small">{t.stuckInvalid}</p>}
        <button type="submit" className="button" disabled={busy || !valid}>{t.stuckSubmit}</button>
      </form>
      <div aria-live="polite" aria-atomic="true">
        {busy && <p role="status">{state.kind === 'waiting' ? t.stuckWaiting : t.stuckGenerating}</p>}
        {state.kind === 'error' && <p role="alert" className="ai-error">{state.text}</p>}
        {state.kind === 'ready' && <div className="ai-guide">
          <p className="ai-label">{t.generatedByAi}</p>
          <p className="muted small">{t.stuckAnswerFor} {state.answer.problem}</p>
          <h3>{t.stuckCauses}</h3>
          <ul>{state.answer.causes.map((cause, index) => <li key={index}>{cause.reason} {citations(cause.sourceIds, state.answer)}</li>)}</ul>
          <h3>{t.stuckSteps}</h3>
          <ol className="guide-steps">{state.answer.steps.map((step, index) => <li key={index}>{step.instruction} {citations(step.sourceIds, state.answer)}</li>)}</ol>
          <p className="muted small">{t.guideDisclaimer}</p>
          <p className="muted small">{t.aiGeneratedAt(formatDateTime(state.answer.generatedAt))}</p>
          <h3 className="small">{t.guideSources}</h3>
          <ul>{state.answer.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            <p className="muted small">{t.sourceFetchedAt(formatDateTime(source.fetchedAt))}</p></li>)}</ul>
        </div>}
      </div>
      {historyError && <p className="muted small">{t.stuckHistoryError}</p>}
      {!!history.length && <div className="help-history"><h3 className="small">{t.stuckHistory}</h3><ul>{history.map((answer) => <li key={answer.id}>
        <button type="button" className="history-question" disabled={busy} onClick={() => { setProblem(answer.problem); setState({ kind: 'ready', answer }); }}>{answer.problem}</button>
        <span className="muted small"> {formatDateTime(answer.generatedAt)}</span>
      </li>)}</ul></div>}
    </div>}
  </section>;
}
