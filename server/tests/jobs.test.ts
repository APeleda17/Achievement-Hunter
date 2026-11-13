import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobQueue, type JobQueue } from '../src/jobs/jobQueue.js';

describe('EIL-01..04 DI užduočių eilė', () => {
  let queue: JobQueue<string>;
  beforeEach(() => { vi.useFakeTimers(); queue = createJobQueue<string>(); });
  afterEach(async () => { queue.dispose(); await vi.advanceTimersByTimeAsync(0); vi.useRealTimers(); });

  it('EIL-02: vykdo ne daugiau kaip 2 darbus, trečias laukia ir tada pradedamas', async () => {
    const resolvers: ((value: string) => void)[] = [];
    const work = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
    const a = queue.submit(1, 'a', work);
    const b = queue.submit(1, 'b', work);
    const c = queue.submit(1, 'c', work);
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(2);
    expect(queue.get(1, a.id).status).toBe('VYKDOMA');
    expect(queue.get(1, b.id).status).toBe('VYKDOMA');
    expect(queue.get(1, c.id).status).toBe('LAUKIA');
    resolvers[0]('done');
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(3);
    expect(queue.get(1, a.id)).toMatchObject({ status: 'BAIGTA', result: 'done' });
  });

  it('EIL-02: pasikartojančiai aktyviai užklausai grąžina tą patį ID', async () => {
    const work = vi.fn(() => new Promise<string>(() => {}));
    const first = queue.submit(1, 'same', work);
    expect(queue.submit(1, 'same', work).id).toBe(first.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.submit(1, 'same', work).id).toBe(first.id);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('EIL-03: rezultatą ir būseną mato tik savininkas', async () => {
    const job = queue.submit(1, 'a', async () => 'private');
    expect(() => queue.get(2, job.id)).toThrow('NOT_FOUND');
    await vi.advanceTimersByTimeAsync(0);
    expect(() => queue.get(2, job.id)).toThrow('NOT_FOUND');
    expect(queue.get(1, job.id).result).toBe('private');
  });

  it('EIL-03: baigtą rezultatą pašalina po 10 min., o ne anksčiau', async () => {
    const job = queue.submit(1, 'a', async () => 'result');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(599_999);
    expect(queue.get(1, job.id).status).toBe('BAIGTA');
    await vi.advanceTimersByTimeAsync(1);
    expect(() => queue.get(1, job.id)).toThrow('NOT_FOUND');
  });

  it('EIL-04: po 120 s nutraukia darbą ir pavėluotas atsakymas klaidos nepakeičia', async () => {
    let signal: AbortSignal;
    let resolve: (value: string) => void;
    const job = queue.submit(1, 'a', (s) => { signal = s; return new Promise((r) => { resolve = r; }); });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(queue.get(1, job.id).status).toBe('VYKDOMA');
    await vi.advanceTimersByTimeAsync(1);
    expect(signal!.aborted).toBe(true);
    expect(queue.get(1, job.id)).toMatchObject({ status: 'KLAIDA', error: { code: 'AI_JOB_TIMEOUT' } });
    resolve!('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.get(1, job.id).status).toBe('KLAIDA');
  });

  it('sugedęs darbas atlaisvina vietą, o techninė klaida neatskleidžiama', async () => {
    const job = queue.submit(1, 'a', async () => { throw new Error('secret internal details'); });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.get(1, job.id)).toEqual({ id: job.id, status: 'KLAIDA', error: { code: 'INTERNAL_ERROR' } });
    expect(queue.submit(1, 'a', async () => 'retry').id).not.toBe(job.id);
  });
});
