import type { ReactNode } from 'react';
import { t } from '../messages';
import { formatDateTime } from '../format';

// Maži pakartotinai naudojami komponentai.

export type NoticeKind = 'info' | 'success' | 'warning' | 'error';

/** Pranešimas šalia turinio (UI-08). role="status" – ekrano skaitytuvai jį perskaito. */
export function Notice({ kind, children }: { kind: NoticeKind; children: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="muted" role="status">{t.loading}</p>;
}

/** Klaidos būsena su „Bandyti dar kartą“ (FR-13). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <Notice kind="error">{message}</Notice>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          {t.retry}
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Mygtukas „Atnaujinti“ + paskutinio atnaujinimo laikas (FR-10, FR-11, UI-03). */
export function RefreshBar({
  lastSyncedAt,
  refreshing,
  onRefresh,
}: {
  lastSyncedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="refresh-bar">
      <button type="button" className="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? t.refreshing : t.refresh}
      </button>
      <span className="muted">{lastSyncedAt ? t.lastSync(formatDateTime(lastSyncedAt)) : t.neverSynced}</span>
    </div>
  );
}

/** Instrukcija, kaip atverti Steam profilį (FR-04). */
export function PrivateProfileHelp() {
  return (
    <div className="notice notice-warning" role="alert">
      <p>
        <strong>{t.privateTitle}</strong>
      </p>
      <ol>
        {t.privateSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer">
        {t.privateLink}
      </a>
    </div>
  );
}
