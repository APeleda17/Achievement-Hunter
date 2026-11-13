import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementHelp } from '../src/components/AchievementHelp';
import { api, ApiError } from '../src/api';
import type { HelpAnswer } from '../src/types';

const props = { appId: 220, apiName: 'CROWBAR', name: 'Trusty Hardware', description: 'Get the crowbar.' };
const answer: HelpAnswer = { id: 1, problem: 'The crowbar did not unlock.', model: 'fake', generatedByAi: true, generatedAt: '2026-11-13T12:00:00Z', causes: [{ reason: 'You may not have collected the dropped crowbar.', sourceIds: [7] }], steps: [{ instruction: 'Pick up the dropped crowbar from the ground.', sourceIds: [7] }], sources: [{ id: 7, title: 'Guide', url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=1', type: 'STEAM_GUIDE', fetchedAt: '2026-11-13T11:00:00Z' }] };
const open = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'I’m Stuck!' })); }); };
const edit = async (value: string) => { await act(async () => { fireEvent.change(screen.getByRole('textbox'), { target: { value } }); }); };
const submit = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Gauti pagalbą', exact: true })); }); };

describe('NI-5 / GVS-12: pagalbos forma ir istorija', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(api, 'getHelpHistory').mockResolvedValue({ requests: [] }); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('neatidarius nesiunčia istorijos užklausų kiekvienam pasiekimui', () => {
    render(<AchievementHelp {...props} />); expect(api.getHelpHistory).not.toHaveBeenCalled();
  });
  it('tuščią ir 501 simbolio aprašą blokuoja; 500 Unicode simbolių priima', async () => {
    render(<AchievementHelp {...props} />); await open();
    const button = screen.getByRole('button', { name: 'Gauti pagalbą', exact: true }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await edit(' \n '); expect(button.disabled).toBe(true);
    await edit('😀'.repeat(500)); expect(button.disabled).toBe(false); expect(screen.getByText('500/500')).toBeTruthy();
    await edit('😀'.repeat(501)); expect(button.disabled).toBe(true); expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('normalizuoja NFC ir rodo priežastis, žingsnius, šaltinius, DI žymą ir datą', async () => {
    const send = vi.spyOn(api, 'help').mockResolvedValue(answer);
    render(<AchievementHelp {...props} />); await open(); await edit(' e\u0301 '); await submit();
    expect(send).toHaveBeenCalledWith(220, 'CROWBAR', 'é', expect.any(AbortSignal));
    expect(screen.getByText(answer.causes[0].reason)).toBeTruthy(); expect(screen.getByText(answer.steps[0].instruction)).toBeTruthy();
    expect(screen.getByText('Sugeneruota DI')).toBeTruthy(); expect(screen.getByText(/DI atsakymas gali būti netikslus/)).toBeTruthy();
    expect(screen.getByText(/Parengta/)).toBeTruthy(); expect(screen.getByText(/Informacija gauta/)).toBeTruthy();
  });
  it('būseną tikrina kas 2 s ir generuojant blokuoja pakartotinį siuntimą', async () => {
    const send = vi.spyOn(api, 'help').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getHelpJob').mockResolvedValueOnce({ id: 'job', status: 'VYKDOMA' }).mockResolvedValueOnce({ id: 'job', status: 'BAIGTA', result: answer });
    render(<AchievementHelp {...props} />); await open(); await edit(answer.problem); await submit(); await submit();
    expect(send).toHaveBeenCalledOnce(); expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); }); expect(poll).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(screen.getByRole('status').textContent).toContain('Renkama');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); expect(screen.getByText(answer.steps[0].instruction)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); expect(poll).toHaveBeenCalledTimes(2);
  });
  it('rodo anksčiau išsaugotą atsakymą be naujo modelio kvietimo', async () => {
    vi.mocked(api.getHelpHistory).mockResolvedValue({ requests: [answer] });
    const send = vi.spyOn(api, 'help');
    render(<AchievementHelp {...props} />); await open();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: answer.problem })); });
    expect(screen.getByText(answer.causes[0].reason)).toBeTruthy(); expect(send).not.toHaveBeenCalled();
  });
  it.each([['NO_RELIABLE_INFO', 'Patikimos informacijos'], ['SOURCES_UNAVAILABLE', 'Informacijos šaltiniai'], ['AI_UNAVAILABLE', 'DI pagalba'], ['AI_INVALID_RESPONSE', 'Nepavyko gauti tinkamos pagalbos'], ['AI_JOB_TIMEOUT', 'užtruko per ilgai']])('rodo klaidą %s ir leidžia kartoti', async (code, text) => {
    vi.spyOn(api, 'help').mockRejectedValue(new ApiError(502, code));
    render(<AchievementHelp {...props} />); await open(); await edit('Problem'); await submit();
    expect(screen.getByRole('alert').textContent).toContain(text);
    expect((screen.getByRole('button', { name: 'Gauti pagalbą', exact: true }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('uždarius formą nutraukia polling', async () => {
    const send = vi.spyOn(api, 'help').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    const poll = vi.spyOn(api, 'getHelpJob');
    render(<AchievementHelp {...props} />); await open(); await edit('Problem'); await submit(); await open();
    expect(send.mock.calls[0][3]?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); expect(poll).not.toHaveBeenCalled();
  });
  it('pasikeitus pasiekimui išvalo privačią formą ir ignoruoja seną atsakymą', async () => {
    let resolve!: (value: HelpAnswer) => void;
    const send = vi.spyOn(api, 'help').mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(<AchievementHelp {...props} />); await open(); await edit('Problem'); await submit();
    view.rerender(<AchievementHelp {...props} apiName="OTHER" />);
    await act(async () => { resolve(answer); });
    expect(send.mock.calls[0][3]?.aborted).toBe(true); expect(screen.queryByText(answer.steps[0].instruction)).toBeNull();
  });
  it('401 perduoda atsijungimui', async () => {
    vi.spyOn(api, 'help').mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    const onUnauthorized = vi.fn(); render(<AchievementHelp {...props} onUnauthorized={onUnauthorized} />);
    await open(); await edit('Problem'); await submit(); expect(onUnauthorized).toHaveBeenCalledOnce();
  });
  it('problemos ir DI teksto nevykdo kaip HTML', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    vi.spyOn(api, 'help').mockResolvedValue({ ...answer, problem: attack, causes: [{ reason: attack, sourceIds: [7] }] });
    const view = render(<AchievementHelp {...props} />); await open(); await edit(attack); await submit();
    expect(screen.getAllByText(attack).length).toBeGreaterThan(0); expect(view.container.querySelector('img')).toBeNull();
  });
});
