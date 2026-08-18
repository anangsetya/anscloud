/**
 * Migration Store — module-level singleton.
 * Persists across client-side navigations in Next.js SPA so that
 * a running migration continues even when the user switches tabs.
 */

export interface MigrationError {
  fileName: string;
  error: string;
}

export interface MigrationResult {
  mode: string;
  migrated: number;
  skipped: number;
  failed: number;
  totalBytesMigrated: string;
  totalBytesMigratedFormatted?: string;
  errors?: MigrationError[];
  message?: string;
}

export type MigrationStatus = 'idle' | 'running' | 'done' | 'error';

export interface MigrationState {
  status: MigrationStatus;
  result: MigrationResult | null;
  error: string | null;
  startedAt: number | null;
  totalFiles: number;
}

const INITIAL: MigrationState = {
  status: 'idle',
  result: null,
  error: null,
  startedAt: null,
  totalFiles: 0,
};

// ── module-level singleton ──────────────────────────────
let state: MigrationState = { ...INITIAL };
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

export function getMigrationSnapshot(): MigrationState {
  return state;
}

export function startMigration(totalFiles: number) {
  state = { status: 'running', result: null, error: null, startedAt: Date.now(), totalFiles };
  notify();
}

export function completeMigration(result: MigrationResult) {
  state = { ...state, status: 'done', result };
  notify();
}

export function failMigration(error: string) {
  state = { ...state, status: 'error', error };
  notify();
}

export function resetMigration() {
  state = { ...INITIAL };
  notify();
}

export function subscribeMigration(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

// ── React hook (client only) ───────────────────────────
import { useSyncExternalStore } from 'react';

const SERVER_SNAPSHOT: MigrationState = { ...INITIAL };

export function useMigrationStore(): MigrationState {
  return useSyncExternalStore(subscribeMigration, getMigrationSnapshot, () => SERVER_SNAPSHOT);
}