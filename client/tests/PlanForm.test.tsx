import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlanForm, parseMinutes } from '../src/components/PlanForm';
import { AchievementFilters } from '../src/components/AchievementFilters';
import { api, ApiError } from '../src/api';
import type { Plan } from '../src/types';


const plan: Plan = {
  id: 7, appId: 620, gameName: 'Portal 2', createdAt: '2026-11-14T10:00:00Z', model: 'fake', generatedByAi: true,
  criteria: { availableMinutes: 60, desiredDifficulty: null, achievementType: null }, totalMinutes: 40,
  progress: { done: 0, total: 2, percent: 0 }, items: [],
};

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/zaidimai/620']}>
      <Routes>
        <Route path="/zaidimai/:appId" element={<PlanForm appId={620} />} />
        <Route path="/planai/:planId" element={<p>Plano puslapis</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GVS-16: PlanForm', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  const minutesInput = () => screen.getByLabelText(/Turimas laikas/) as HTMLInputElement;
  const submit = () => screen.getByRole('button', { name: 'Sudaryti planą' }) as HTMLButtonElement;

  it.each([['60', 60], ['15', 15], ['600', 600], ['14', null], ['601', null], ['30.5', null], ['', null], ['abc', null]])(
    'parseMinutes(%j) → %j', (value, expected) => { expect(parseMinutes(value)).toBe(expected); });

  it('neteisingas laikas – mygtukas išjungtas, rodomas pranešimas, užklausa nesiunčiama', () => {
    const create = vi.spyOn(api, 'createPlan');
    renderForm();
    fireEvent.change(minutesInput(), { target: { value: '10' } });
    expect(submit().disabled).toBe(true);
    expect(screen.getByText(/nuo 15 iki 600/)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('siunčia kriterijus, laukia užduoties ir atidaro sudarytą planą', async () => {
    const create = vi.spyOn(api, 'createPlan').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    vi.spyOn(api, 'getPlanJob').mockResolvedValueOnce({ id: 'job', status: 'VYKDOMA' }).mockResolvedValueOnce({ id: 'job', status: 'BAIGTA', result: plan });
    renderForm();
    fireEvent.change(minutesInput(), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Norimas sunkumas'), { target: { value: 'EASY' } });
    await act(async () => { fireEvent.click(submit()); await vi.advanceTimersByTimeAsync(0); });

    expect(create).toHaveBeenCalledWith({ appId: 620, availableMinutes: 45, difficulty: 'EASY' }, expect.anything());
    expect(submit().disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('status').textContent).toContain('DI sudaro planą');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText('Plano puslapis')).toBeTruthy();
  });

  it('PLN-02: kandidatų nėra – suprantamas pranešimas, galima bandyti dar kartą', async () => {
    vi.spyOn(api, 'createPlan').mockRejectedValue(new ApiError(422, 'NO_CANDIDATES'));
    renderForm();
    await act(async () => { fireEvent.click(submit()); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert').textContent).toContain('Tinkamų pasiekimų planui nerasta');
    expect(submit().disabled).toBe(false);
  });

  it('DI užduotis baigiasi klaida – rodomas pranešimas be techninio kodo', async () => {
    vi.spyOn(api, 'createPlan').mockResolvedValue({ jobId: 'job', status: 'LAUKIA' });
    vi.spyOn(api, 'getPlanJob').mockResolvedValue({ id: 'job', status: 'KLAIDA', error: { code: 'AI_UNAVAILABLE' } });
    renderForm();
    await act(async () => { fireEvent.click(submit()); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('alert').textContent).toContain('nepasiekiama');
    expect(screen.getByRole('alert').textContent).not.toContain('AI_UNAVAILABLE');
  });
});

describe('GVS-15: AchievementFilters', () => {
  afterEach(cleanup);

  it('pasirinkus reikšmę praneša naują užklausą; tuščia reikšmė filtrą pašalina', () => {
    const onChange = vi.fn();
    const view = render(<AchievementFilters query={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sunkumas'), { target: { value: 'HARD' } });
    expect(onChange).toHaveBeenLastCalledWith({ difficulty: 'HARD' });

    view.rerender(<AchievementFilters query={{ difficulty: 'HARD', sort: 'rarity' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sunkumas'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ difficulty: undefined, sort: 'rarity' });
  });

  it('„Išvalyti filtrus“ rodomas tik su aktyviais filtrais ir viską išvalo', () => {
    const onChange = vi.fn();
    const view = render(<AchievementFilters query={{}} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Išvalyti filtrus' })).toBeNull();

    view.rerender(<AchievementFilters query={{ status: 'locked', order: 'desc' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Išvalyti filtrus' }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});