import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementRedo } from '../src/components/AchievementRedo';
import { api, ApiError } from '../src/api';
import type { Explanation } from '../src/types';

const props = { appId: 620, apiName: 'EXPLORER', name: 'Explorer', description: 'Find all five hidden rooms without restarting the level.' };
const result: Explanation = { text: 'Find 5 secret rooms without restarting.', model: 'fake', generatedByAi: true, generatedAt: '2026-11-12T12:00:00.000Z' };

describe('NI-2 / GVS-10,11', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  const click = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Paaiškinti pasiekimą/ })); }); };

  it('išsaugotą paaiškinimą rodo iš karto, su DI žyma ir įspėjimu, be polling', async () => {
    vi.spyOn(api, 'explain').mockResolvedValue(result);
    const poll = vi.spyOn(api, 'getAiJob');
    render(<AchievementRedo {...props} />);
    await click();
    expect(screen.getByText(result.text)).toBeTruthy();
    expect(screen.getByText('Sugeneruota DI')).toBeTruthy();
    expect(screen.getByText(/DI atsakymas gali būti netikslus/)).toBeTruthy();
    expect(screen.getByText(/Parengta/)).toBeTruthy();
    expect(poll).not.toHaveBeenCalled();
  });

  it('GVS-10: mygtuką blokuoja, užduotį tikrina kas 2 s ir baigęs sustoja', async () => {
    const submit = vi.spyOn(api, 'explain').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getAiJob').mockResolvedValueOnce({ id: 'job', status: 'VYKDOMA' }).mockResolvedValueOnce({ id: 'job', status: 'BAIGTA', result });
    render(<AchievementRedo {...props} />);
    await click();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('laukia');
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(poll).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(poll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Ruošiamas');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText(result.text)).toBeTruthy();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('išėjus iš ekrano nutraukia laukimą ir daugiau būsenos neklausia', async () => {
    vi.spyOn(api, 'explain').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getAiJob');
    const view = render(<AchievementRedo {...props} />);
    await click();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(poll).not.toHaveBeenCalled();
  });

  it('pasikeitus pasiekimui pavėluoto seno rezultato neparodo', async () => {
    let complete!: (value: Explanation) => void;
    vi.spyOn(api, 'explain').mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<AchievementRedo {...props} />);
    await click();
    view.rerender(<AchievementRedo {...props} apiName="OTHER" />);
    await act(async () => { complete(result); });
    expect(screen.queryByText(result.text)).toBeNull();
  });

  it.each(['AI_UNAVAILABLE', 'AI_INVALID_RESPONSE', 'AI_JOB_TIMEOUT', 'NOT_FOUND'])('rodo suprantamą %s klaidą ir leidžia bandyti dar kartą', async (code) => {
    vi.spyOn(api, 'explain').mockRejectedValueOnce(new ApiError(503, code)).mockResolvedValueOnce(result);
    render(<AchievementRedo {...props} />);
    await click();
    expect(screen.getByRole('alert').textContent).not.toContain(code);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    await click();
    expect(screen.getByText(result.text)).toBeTruthy();
  });

  it('užduoties klaidos būseną parodo kaip pranešimą', async () => {
    vi.spyOn(api, 'explain').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    vi.spyOn(api, 'getAiJob').mockResolvedValue({ id: 'job', status: 'KLAIDA', error: { code: 'AI_UNAVAILABLE' } });
    render(<AchievementRedo {...props} />);
    await click();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('alert').textContent).toContain('nepasiekiama');
  });

  it('be originalaus aprašymo mygtukas išjungtas ir užklausa nesiunčiama', async () => {
    const submit = vi.spyOn(api, 'explain');
    render(<AchievementRedo {...props} description={null} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/neturi paaiškinimui tinkamo aprašymo/)).toBeTruthy();
    await click();
    expect(submit).not.toHaveBeenCalled();
  });

  it('pasibaigus sesijai grąžina valdymą prisijungimo srautui', async () => {
    vi.spyOn(api, 'explain').mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    const logout = vi.fn();
    render(<AchievementRedo {...props} onUnauthorized={logout} />);
    await click();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('modelio HTML atvaizduoja kaip tekstą, jo nevykdo', async () => {
    vi.spyOn(api, 'explain').mockResolvedValue({ ...result, text: '<img src=x onerror=alert(1)>' });
    const view = render(<AchievementRedo {...props} />);
    await click();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(view.container.querySelector('img')).toBeNull();
  });
});
