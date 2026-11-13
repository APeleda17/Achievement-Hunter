import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementGuide } from '../src/components/AchievementGuide';
import { api, ApiError } from '../src/api';
import type { Guide } from '../src/types';

const props = { appId: 220, apiName: 'CROWBAR', name: 'Trusty Hardware', description: 'Get the crowbar.' };
const result: Guide = { id: 1, model: 'fake', generatedByAi: true, generatedAt: '2026-11-13T10:00:00Z',
  steps: [{ instruction: 'Go to Barney on the walkway.', sourceIds: [3] }, { instruction: 'Pick up the crowbar he drops.', sourceIds: [3] }],
  sources: [{ id: 3, title: 'HL2 Walkthrough', url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=123', type: 'STEAM_GUIDE', fetchedAt: '2026-11-13T09:00:00Z' }] };

describe('NI-3 vadovo sąsaja', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  const click = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Parengti pasiekimo/ })); }); };

  it('rodo numeruotus žingsnius, šaltinius su nuorodomis, datas ir DI įspėjimą', async () => {
    vi.spyOn(api, 'guide').mockResolvedValue(result);
    const poll = vi.spyOn(api, 'getGuideJob');
    render(<AchievementGuide {...props} />);
    await click();
    expect(screen.getByText(result.steps[0].instruction)).toBeTruthy();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('Sugeneruota DI')).toBeTruthy();
    expect(screen.getByText(/DI atsakymas gali būti netikslus/)).toBeTruthy();
    expect(screen.getByText(/Informacija gauta/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'HL2 Walkthrough', exact: true }).every((link) => link.getAttribute('href') === result.sources[0].url)).toBe(true);
    expect(poll).not.toHaveBeenCalled();
  });
  it('tikrina būseną kas 2 s, blokuoja mygtuką ir baigęs sustoja', async () => {
    vi.spyOn(api, 'guide').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getGuideJob').mockResolvedValueOnce({ id: 'job', status: 'VYKDOMA' }).mockResolvedValueOnce({ id: 'job', status: 'BAIGTA', result });
    render(<AchievementGuide {...props} />);
    await click();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(poll).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('status').textContent).toContain('Ieškoma');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText(result.steps[1].instruction)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(poll).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['NO_RELIABLE_INFO', 'Patikimos informacijos'],
    ['SOURCES_UNAVAILABLE', 'Informacijos šaltiniai'],
    ['AI_INVALID_RESPONSE', 'Nepavyko parengti'],
    ['AI_JOB_TIMEOUT', 'užtruko per ilgai'],
  ])('aiškiai rodo %s ir leidžia kartoti', async (code, text) => {
    vi.spyOn(api, 'guide').mockResolvedValue({ jobId: 'job', status: 'VYKDOMA' });
    vi.spyOn(api, 'getGuideJob').mockResolvedValue({ id: 'job', status: 'KLAIDA', error: { code } });
    render(<AchievementGuide {...props} />);
    await click();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('alert').textContent).toContain(text);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
  it('gali ieškoti pagal pavadinimą ir be Steam aprašo', async () => {
    const submit = vi.spyOn(api, 'guide').mockResolvedValue(result);
    render(<AchievementGuide {...props} description={null} />);
    await click();
    expect(submit).toHaveBeenCalledWith(220, 'CROWBAR', expect.any(AbortSignal));
  });
  it('išėjus iš ekrano atšaukia užklausą ir nebetikrina būsenos', async () => {
    const submit = vi.spyOn(api, 'guide').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getGuideJob');
    const view = render(<AchievementGuide {...props} />);
    await click();
    view.unmount();
    expect(submit.mock.calls[0][2]?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(poll).not.toHaveBeenCalled();
  });
  it('pasikeitus pasiekimui ignoruoja ankstesnį atsakymą', async () => {
    let resolve!: (value: Guide) => void;
    vi.spyOn(api, 'guide').mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(<AchievementGuide {...props} />);
    await click();
    view.rerender(<AchievementGuide {...props} apiName="OTHER" name="Other" />);
    await act(async () => { resolve(result); });
    expect(screen.queryByText(result.steps[0].instruction)).toBeNull();
  });
  it('401 perduoda atsijungimo veiksmui', async () => {
    vi.spyOn(api, 'guide').mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    const onUnauthorized = vi.fn();
    render(<AchievementGuide {...props} onUnauthorized={onUnauthorized} />);
    await click();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
  it('DI tekstą atvaizduoja kaip tekstą, nevykdo HTML', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    vi.spyOn(api, 'guide').mockResolvedValue({ ...result, steps: [{ instruction: attack, sourceIds: [3] }, result.steps[1]] });
    const view = render(<AchievementGuide {...props} />);
    await click();
    expect(screen.getByText(attack)).toBeTruthy();
    expect(view.container.querySelector('img')).toBeNull();
  });
});
