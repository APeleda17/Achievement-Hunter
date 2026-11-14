import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementAssessment } from '../src/components/AchievementAssessment';
import { createSerialQueue } from '../src/aiJob';
import { api, ApiError } from '../src/api';
import type { Achievement, AvailabilityAssessment } from '../src/types';


const base: Achievement = {
  apiName: 'ACH_1', name: 'First', description: 'Do the first thing.', iconUrl: null, unlocked: false, unlockedAt: null,
  rarityPercent: 12.5, availability: null, availabilityReason: null, difficulty: null, achievementType: null,
};
const result: AvailabilityAssessment = {
  availability: 'PRIEINAMAS', difficulty: 'MEDIUM', achievementType: 'COLLECTION', reason: 'It can be earned in normal play.',
  assessedAt: '2026-11-14T10:00:00Z', model: 'fake', generatedByAi: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('NI-9 / GVS-14: AchievementAssessment', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('įvertintam pasiekimui rodo prieinamumą, sunkumą, tipą, retumą ir DI pagrindimą; mygtuko nėra', () => {
    render(<AchievementAssessment appId={620} achievement={{ ...base, availability: 'NEPRIEINAMAS', difficulty: 'HARD',
      achievementType: 'CHALLENGE', availabilityReason: 'The event has ended.' }} />);
    expect(screen.getByText('Neprieinamas')).toBeTruthy();
    expect(screen.getByText('Sunkus')).toBeTruthy();
    expect(screen.getByText('Iššūkis')).toBeTruthy();
    expect(screen.getByText(/Gavo 12,5/)).toBeTruthy();
    expect(screen.getByText(/The event has ended/)).toBeTruthy();
    expect(screen.getByText(/neįtraukiamas į planus/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('mygtukas „Įvertinti“ įvertina iš karto ir parodo žymes', async () => {
    vi.spyOn(api, 'assessAvailability').mockResolvedValue(result);
    render(<AchievementAssessment appId={620} achievement={base} />);
    expect(screen.getByText('Neįvertinta')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Įvertinti pasiekimo „First“/ })); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Prieinamas')).toBeTruthy();
    expect(screen.getByText('Vidutinis')).toBeTruthy();
    expect(screen.getByText('Kolekcija')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('PRI-02: su eile vertina automatiškai, po vieną; kitas pradedamas tik pasibaigus pirmam', async () => {
    const first = deferred<AvailabilityAssessment>();
    const assess = vi.spyOn(api, 'assessAvailability')
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ ...result, difficulty: 'EASY' });
    const queue = createSerialQueue();
    render(<>
      <AchievementAssessment appId={620} achievement={base} queue={queue} />
      <AchievementAssessment appId={620} achievement={{ ...base, apiName: 'ACH_2', name: 'Second', unlocked: true }} queue={queue} />
    </>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(assess).toHaveBeenCalledTimes(1);
    expect(assess).toHaveBeenLastCalledWith(620, 'ACH_1', expect.anything());
    expect(screen.getByText('Bus įvertinta automatiškai…')).toBeTruthy();

    await act(async () => { first.resolve(result); await vi.advanceTimersByTimeAsync(0); });
    expect(assess).toHaveBeenCalledTimes(2);
    expect(assess).toHaveBeenLastCalledWith(620, 'ACH_2', expect.anything());
    expect(screen.getByText('Vidutinis')).toBeTruthy();
    expect(screen.getByText('Lengvas')).toBeTruthy();
  });

  it('PRI-02: serveriui ar DI neveikiant eilė sustoja po pirmos klaidos, kitiems lieka mygtukas', async () => {
    const assess = vi.spyOn(api, 'assessAvailability').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const queue = createSerialQueue();
    render(<>
      <AchievementAssessment appId={620} achievement={base} queue={queue} />
      <AchievementAssessment appId={620} achievement={{ ...base, apiName: 'ACH_2', name: 'Second' }} queue={queue} />
      <AchievementAssessment appId={620} achievement={{ ...base, apiName: 'ACH_3', name: 'Third' }} queue={queue} />
    </>);
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(assess).toHaveBeenCalledTimes(1);
    expect(queue.halted).toBe(true);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText('Bus įvertinta automatiškai…')).toBeNull();
    expect((screen.getByRole('button', { name: /„Third“/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('netinkamas vieno pasiekimo DI atsakymas eilės nestabdo', async () => {
    const assess = vi.spyOn(api, 'assessAvailability')
      .mockRejectedValueOnce(new ApiError(502, 'AI_INVALID_RESPONSE'))
      .mockResolvedValueOnce(result);
    const queue = createSerialQueue();
    render(<>
      <AchievementAssessment appId={620} achievement={base} queue={queue} />
      <AchievementAssessment appId={620} achievement={{ ...base, apiName: 'ACH_2', name: 'Second' }} queue={queue} />
    </>);
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(assess).toHaveBeenCalledTimes(2);
    expect(queue.halted).toBe(false);
    expect(screen.getByText('Prieinamas')).toBeTruthy();
  });

  it('užduotį (202) tikrina kas 2 s, kol ji baigiasi', async () => {
    vi.spyOn(api, 'assessAvailability').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getAvailabilityJob')
      .mockResolvedValueOnce({ id: 'job', status: 'VYKDOMA' })
      .mockResolvedValueOnce({ id: 'job', status: 'BAIGTA', result });
    render(<AchievementAssessment appId={620} achievement={base} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('status').textContent).toContain('laukia');

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('status').textContent).toContain('Vertinamas');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Prieinamas')).toBeTruthy();
  });

  it('išėjus iš ekrano eilėje laukiantys įvertinimai nebesiunčiami', async () => {
    const first = deferred<AvailabilityAssessment>();
    const assess = vi.spyOn(api, 'assessAvailability').mockImplementation(() => first.promise);
    const queue = createSerialQueue();
    const view = render(<>
      <AchievementAssessment appId={620} achievement={base} queue={queue} />
      <AchievementAssessment appId={620} achievement={{ ...base, apiName: 'ACH_2', name: 'Second' }} queue={queue} />
    </>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    view.unmount();
    await act(async () => { first.resolve(result); await vi.runAllTimersAsync(); });
    expect(assess).toHaveBeenCalledTimes(1);
  });
});