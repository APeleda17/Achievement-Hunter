// PAS – progreso skaičiavimas (FR-08, FR-09, NF-07, PAS-02).
// Gryna funkcija be DB ir Steam – ją lengva testuoti.

export type Progress =
  | { hasAchievements: false }
  | { hasAchievements: true; unlocked: number; total: number; percent: number };

/**
 * percent = atrakinti / visi × 100, suapvalinta iki 0,1 (pvz. 3 iš 8 → 37,5).
 * Kai visi = 0 – dalyba neatliekama, grąžinamas požymis „pasiekimų nėra“ (ne 0 %).
 */
export function calcProgress(unlocked: number, total: number): Progress {
  if (total <= 0) return { hasAchievements: false };
  const percent = Math.round((unlocked / total) * 1000) / 10;
  return { hasAchievements: true, unlocked, total, percent };
}
