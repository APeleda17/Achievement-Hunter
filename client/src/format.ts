// Skaičių ir datų formatavimas lietuviškai (NF-06, FR-11).

const percentFormat = new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 37.5 → „37,5 %“, 100 → „100,0 %“ */
export function formatPercent(value: number): string {
  return `${percentFormat.format(value)} %`;
}

/** „X iš Y (Z,Z %)“ */
export function formatProgress(unlocked: number, total: number, percent: number): string {
  return `${unlocked} iš ${total} (${formatPercent(percent)})`;
}

/** ISO 8601 (UTC) → vietinis naršyklės laikas, pvz. „2026-11-11 22:05“ */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' });
}
