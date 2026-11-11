import { describe, expect, it } from 'vitest';
import { calcProgress } from '../src/achievements/progress.js';

// FR-08, FR-09, NF-07 – progreso skaičiavimas (gryna funkcija, DB nereikia)
describe('calcProgress', () => {
  it('FR-08: 3 iš 8 → 37,5 %', () => {
    expect(calcProgress(3, 8)).toEqual({ hasAchievements: true, unlocked: 3, total: 8, percent: 37.5 });
  });

  it('FR-08: 8 iš 8 → 100,0 %', () => {
    expect(calcProgress(8, 8)).toMatchObject({ percent: 100 });
  });

  it('FR-08: 0 iš 5 → 0,0 % (pasiekimai yra, bet neatrakinti)', () => {
    expect(calcProgress(0, 5)).toMatchObject({ hasAchievements: true, percent: 0 });
  });

  it('FR-08: apvalinama iki 1 skaitmens po kablelio (NF-07 paklaida ≤ 0,05)', () => {
    expect(calcProgress(1, 3)).toMatchObject({ percent: 33.3 });
    expect(calcProgress(2, 3)).toMatchObject({ percent: 66.7 });
    expect(calcProgress(1, 7)).toMatchObject({ percent: 14.3 });
  });

  it('FR-09: 0 iš 0 → „pasiekimų nėra“, o ne 0 % ir ne NaN', () => {
    const result = calcProgress(0, 0);
    expect(result).toEqual({ hasAchievements: false });
    expect(result).not.toHaveProperty('percent');
  });
});
