import { ApiError } from './api';
import type { AiJob } from './types';


export type JobPhase = 'waiting' | 'generating';

function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}


export async function waitForJob<T>(
  jobId: string,
  poll: (id: string, signal: AbortSignal) => Promise<AiJob<T>>,
  signal: AbortSignal,
  onPhase: (phase: JobPhase) => void,
): Promise<T> {
  for (;;) {
    await waitForPoll(signal);
    const job = await poll(jobId, signal);
    signal.throwIfAborted();
    if (job.status === 'BAIGTA') return job.result;
    if (job.status === 'KLAIDA') throw new ApiError(502, job.error.code);
    onPhase(job.status === 'VYKDOMA' ? 'generating' : 'waiting');
  }
}

export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();
  let halted = false;
  return {
    get halted() { return halted; },
    halt() { halted = true; },
    run(task: () => Promise<void>): Promise<void> {
      const result = tail.then(() => {
        if (halted) throw new DOMException('Queue halted', 'AbortError');
        return task();
      });
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
export type SerialQueue = ReturnType<typeof createSerialQueue>;