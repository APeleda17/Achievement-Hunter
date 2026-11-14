import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlanPage } from '../src/pages/PlanPage';
import { createSerialQueue } from '../src/aiJob';
import { api, ApiError } from '../src/api';
import type { Plan } from '../src/types';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ logout }) }));


const plan: Plan = {
  id: 7, appId: 620, gameName: 'Portal 2', createdAt: '2026-11-14T10:00:00Z', model: 'fake', generatedByAi: true,
  criteria: { availableMinutes: 60, desiredDifficulty: 'EASY', achievementType: null }, totalMinutes: 50,
  progress: { done: 1, total: 2, percent: 50 },
  items: [
    { id: 1, position: 1, apiName: 'ACH_4', name: 'Fourth', description: 'Do four.', iconUrl: null, estimatedMinutes: 20,
      justification: 'Quick one to start.', status: 'ATLIKTAS', completedAt: '2026-11-14T11:00:00Z' },
    { id: 2, position: 2, apiName: 'ACH_5', name: 'Fifth', description: null, iconUrl: null, estimatedMinutes: 30,
      justification: 'Continue with this one.', status: 'NEATLIKTAS', completedAt: null },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/planai/7']}>
      <Routes><Route path="/planai/:planId" element={<PlanPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('GVS-17: PlanPage', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('rodo kriterijus, progresą, punktus su trukme ir pagrindimu bei DI žymą', async () => {
    vi.spyOn(api, 'getPlan').mockResolvedValue(plan);
    await act(async () => { renderPage(); });

    expect(screen.getByRole('heading', { name: 'Planas: Portal 2' })).toBeTruthy();
    expect(screen.getByText(/Atlikta 1 iš 2 \(50,0 %\)/)).toBeTruthy();
    expect(screen.getByText(/Numatyta 50 min\. iš 60 min\./)).toBeTruthy();
    expect(screen.getByText(/Norimas sunkumas: Lengvas/)).toBeTruthy();
    expect(screen.getByText('Sugeneruota DI')).toBeTruthy();
    expect(screen.getByText('Quick one to start.')).toBeTruthy();
    expect(screen.getByText('~30 min.')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /„Fourth“/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /„Fifth“/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('PLN-05: pažymėjus punktą siunčia ATLIKTAS ir parodo atnaujintą progresą', async () => {
    vi.spyOn(api, 'getPlan').mockResolvedValue(plan);
    const update = vi.spyOn(api, 'setPlanItemStatus').mockResolvedValue({
      ...plan, progress: { done: 2, total: 2, percent: 100 },
      items: plan.items.map((item) => ({ ...item, status: 'ATLIKTAS' as const, completedAt: '2026-11-14T12:00:00Z' })),
    });
    await act(async () => { renderPage(); });

    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /„Fifth“/ })); });
    expect(update).toHaveBeenCalledWith(7, 2, 'ATLIKTAS');
    expect(screen.getByText(/Atlikta 2 iš 2 \(100,0 %\)/)).toBeTruthy();

    update.mockResolvedValue(plan);
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /„Fourth“/ })); });
    expect(update).toHaveBeenLastCalledWith(7, 1, 'NEATLIKTAS');
  });

  it('svetimas ar neegzistuojantis planas – „Planas nerastas“', async () => {
    vi.spyOn(api, 'getPlan').mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
    await act(async () => { renderPage(); });
    expect(screen.getByRole('alert').textContent).toContain('Planas nerastas');
  });
});

describe('createSerialQueue', () => {
  it('vykdo užduotis po vieną; sustabdžius likusios nevykdomos', async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    const a = queue.run(async () => { order.push('a:start'); await Promise.resolve(); order.push('a:end'); });
    const b = queue.run(async () => { order.push('b'); queue.halt(); });
    const c = queue.run(async () => { order.push('c'); });
    await a; await b;
    await expect(c).rejects.toThrow();
    expect(order).toEqual(['a:start', 'a:end', 'b']);
  });
});
