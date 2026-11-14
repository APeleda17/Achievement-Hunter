import { t } from '../messages';
import { ACHIEVEMENT_TYPES, DIFFICULTIES, type AchievementQuery } from '../types';

// NI-10, NI-11, GVS-15: pasiekimų filtrai ir rūšiavimas (U12, U13).

export const hasActiveFilters = (query: AchievementQuery) =>
  Boolean(query.status || query.availability || query.difficulty || query.type || (query.sort && query.sort !== 'default') || query.order === 'desc');

export function AchievementFilters({ query, onChange, disabled }: {
  query: AchievementQuery; onChange: (query: AchievementQuery) => void; disabled?: boolean;
}) {
  const set = <K extends keyof AchievementQuery>(key: K, value: string) =>
    onChange({ ...query, [key]: value || undefined } as AchievementQuery);

  return (
    <section className="filters" aria-label={t.filtersTitle}>
      <label>
        <span>{t.filterStatus}</span>
        <select value={query.status ?? ''} disabled={disabled} onChange={(e) => set('status', e.target.value)}>
          <option value="">{t.filterAll}</option>
          <option value="locked">{t.statusLocked}</option>
          <option value="unlocked">{t.statusUnlocked}</option>
        </select>
      </label>
      <label>
        <span>{t.filterAvailability}</span>
        <select value={query.availability ?? ''} disabled={disabled} onChange={(e) => set('availability', e.target.value)}>
          <option value="">{t.filterAll}</option>
          {(['PRIEINAMAS', 'NEPRIEINAMAS', 'NEZINOMA'] as const).map((value) => (
            <option key={value} value={value}>{t.availabilityLabel[value]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t.filterDifficulty}</span>
        <select value={query.difficulty ?? ''} disabled={disabled} onChange={(e) => set('difficulty', e.target.value)}>
          <option value="">{t.filterAll}</option>
          {DIFFICULTIES.map((value) => <option key={value} value={value}>{t.difficultyLabel[value]}</option>)}
        </select>
      </label>
      <label>
        <span>{t.filterType}</span>
        <select value={query.type ?? ''} disabled={disabled} onChange={(e) => set('type', e.target.value)}>
          <option value="">{t.filterAll}</option>
          {ACHIEVEMENT_TYPES.map((value) => <option key={value} value={value}>{t.typeLabel[value]}</option>)}
        </select>
      </label>
      <label>
        <span>{t.sortBy}</span>
        <select value={query.sort ?? 'default'} disabled={disabled} onChange={(e) => set('sort', e.target.value === 'default' ? '' : e.target.value)}>
          {(['default', 'name', 'rarity', 'difficulty'] as const).map((value) => (
            <option key={value} value={value}>{t.sortLabel[value]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t.orderLabel}</span>
        <select value={query.order ?? 'asc'} disabled={disabled} onChange={(e) => set('order', e.target.value === 'asc' ? '' : e.target.value)}>
          <option value="asc">{t.orderAsc}</option>
          <option value="desc">{t.orderDesc}</option>
        </select>
      </label>
      {hasActiveFilters(query) && (
        <button type="button" className="button secondary" disabled={disabled} onClick={() => onChange({})}>
          {t.clearFilters}
        </button>
      )}
    </section>
  );
}