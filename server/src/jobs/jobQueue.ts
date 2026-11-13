import { randomUUID } from 'node:crypto';
import { AppError, type ErrorCode } from '../errors.js';

export type JobStatus = 'LAUKIA' | 'VYKDOMA' | 'BAIGTA' | 'KLAIDA';
export interface JobDto<T> {
  id: string;
  status: JobStatus;
  result?: T;
  error?: { code: ErrorCode };
}
interface Job<T> {
  userId: number;
  key: string;
  dto: JobDto<T>;
  expiresAt?: number;
  work: (signal: AbortSignal) => Promise<T>;
}

// EIL-01..04. Vienam prototipo serverio procesui bendra eilė, be papildomo Redis.
export function createJobQueue<T>(options: { concurrency?: number; timeoutMs?: number; ttlMs?: number; now?: () => number } = {}) {
  const jobs = new Map<string, Job<T>>();
  const active = new Map<string, string>();
  const pending: Job<T>[] = [];
  const controllers = new Set<AbortController>();
  const concurrency = Math.min(Math.max(options.concurrency ?? 2, 1), 2);
  const timeoutMs = Math.min(options.timeoutMs ?? 120_000, 120_000);
  const ttlMs = options.ttlMs ?? 600_000;
  const now = options.now ?? Date.now;
  let running = 0;
  let disposed = false;

  function cleanup() {
    for (const [id, job] of jobs) {
      if (job.expiresAt !== undefined && job.expiresAt <= now()) jobs.delete(id);
    }
  }
  const cleanupTimer = setInterval(cleanup, 30_000);
  cleanupTimer.unref();

  function pump() {
    while (!disposed && running < concurrency && pending.length) {
      const job = pending.shift()!;
      running++;
      job.dto.status = 'VYKDOMA';
      const controller = new AbortController();
      controllers.add(controller);
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new AppError(504, 'AI_JOB_TIMEOUT')), { once: true });
        timer = setTimeout(() => {
          controller.abort();
          reject(new AppError(504, 'AI_JOB_TIMEOUT'));
        }, timeoutMs);
        timer.unref();
      });
      void Promise.race([Promise.resolve().then(() => job.work(controller.signal)), deadline])
        .then((result) => {
          if (controller.signal.aborted) throw new AppError(504, 'AI_JOB_TIMEOUT');
          job.dto = { id: job.dto.id, status: 'BAIGTA', result };
        })
        .catch((error: unknown) => {
          const code = controller.signal.aborted ? 'AI_JOB_TIMEOUT' : error instanceof AppError ? error.code : 'INTERNAL_ERROR';
          job.dto = { id: job.dto.id, status: 'KLAIDA', error: { code } };
        })
        .finally(() => {
          clearTimeout(timer!);
          controllers.delete(controller);
          active.delete(job.key);
          job.expiresAt = now() + ttlMs;
          // Po užbaigimo atlaisviname įvesties uždarinį, rezultatą laikome 10 min.
          job.work = async () => { throw new AppError(404, 'NOT_FOUND'); };
          running--;
          pump();
        });
    }
  }
  return {
    submit(userId: number, key: string, work: Job<T>['work']): JobDto<T> {
      cleanup();
      if (disposed) throw new AppError(503, 'AI_UNAVAILABLE');
      const ownerKey = `${userId}:${key}`;
      const existing = active.get(ownerKey);
      if (existing) return { ...jobs.get(existing)!.dto };
      if (pending.length >= 100) throw new AppError(503, 'AI_QUEUE_FULL');
      const job: Job<T> = { userId, key: ownerKey, dto: { id: randomUUID(), status: 'LAUKIA' }, work };
      jobs.set(job.dto.id, job);
      active.set(ownerKey, job.dto.id);
      pending.push(job);
      // HTTP atsakymas nelaukia modelio; vienu metu dirba daugiausia 2 darbai.
      queueMicrotask(pump);
      return { ...job.dto };
    },
    get(userId: number, id: string): JobDto<T> {
      cleanup();
      const job = jobs.get(id);
      if (!job || job.userId !== userId) throw new AppError(404, 'NOT_FOUND');
      return { ...job.dto };
    },
    dispose() {
      disposed = true;
      clearInterval(cleanupTimer);
      for (const controller of controllers) controller.abort();
      pending.length = 0;
      active.clear();
      jobs.clear();
    },
  };
}

export type JobQueue<T> = ReturnType<typeof createJobQueue<T>>;
