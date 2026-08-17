import { db } from './db';
import {
  localStoreFile,
  localReadFile,
  localDeleteFile,
  localCleanupAccount,
} from './providers/local';
import {
  googleDriveStoreFile,
  googleDriveReadFile,
  googleDriveDeleteFile,
  fetchGoogleDriveQuota,
} from './providers/google';
import {
  supabaseStoreFile,
  supabaseReadFile,
  supabaseDeleteFile,
  supabaseCleanupAccount,
  isSupabaseConfigured,
} from './providers/supabase';

/**
 * Storage Driver — abstraction layer for the physical file storage.
 *
 * Dispatches to the correct provider based on `account.provider`:
 *   - 'google' → GoogleDriveProvider (real Google Drive via OAuth)
 *   - 'local'  → Supabase Storage (if SUPABASE_URL is set) — used in production
 *              → Local filesystem (fallback for local dev)
 *
 * Function signatures are intentionally identical across providers so the
 * rest of the app does not need to know which provider is in use.
 */

type FileInput = {
  name: string;
  mimeType: string;
  sizeBytes: bigint;
  data: Buffer;
};

type AccountLike = {
  id: string;
  provider: string;
  email: string;
  displayName: string;
  totalBytes: bigint;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  driveRootFolderId: string | null;
};

/**
 * Compute the free bytes for a given drive account.
 * Used = sum of all VirtualFile.sizeBytes for that account (in our DB).
 * Free = totalBytes - used.
 *
 * Note: For provider='google', this DB-based "used" count may drift from
 * reality (because the user might have other files in their Drive unrelated
 * to AnsCloud). For accurate quota, call refreshAccountQuota() which hits
 * the Drive API directly. The DB-based count is used for fast UI rendering
 * and for the auto-distribution algorithm.
 */
export async function getAccountUsage(accountId: string) {
  const account = await db.driveAccount.findUnique({
    where: { id: accountId },
    select: { totalBytes: true, provider: true, userId: true },
  });
  if (!account) throw new Error('Account not found');

  const usedAgg = await db.virtualFile.aggregate({
    where: { driveAccountId: accountId },
    _sum: { sizeBytes: true },
  });
  const usedBytes = usedAgg._sum.sizeBytes ?? 0n;
  const totalBytes = account.totalBytes;
  const freeBytes = totalBytes > usedBytes ? totalBytes - usedBytes : 0n;
  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usedPct: totalBytes > 0n ? Number((usedBytes * 100n) / totalBytes) : 0,
    provider: account.provider,
    userId: account.userId,
  };
}

export async function getAggregateUsage(userId: string) {
  const accounts = await db.driveAccount.findMany({
    where: { userId },
    select: { id: true, totalBytes: true },
  });
  if (accounts.length === 0) {
    return { totalBytes: 0n, usedBytes: 0n, freeBytes: 0n, usedPct: 0, accountCount: 0 };
  }
  let total = 0n;
  for (const a of accounts) total += a.totalBytes;

  const usedAgg = await db.virtualFile.aggregate({
    where: { userId },
    _sum: { sizeBytes: true },
  });
  const used = usedAgg._sum.sizeBytes ?? 0n;
  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: total > used ? total - used : 0n,
    usedPct: total > 0n ? Number((used * 100n) / total) : 0,
    accountCount: accounts.length,
  };
}

/**
 * Auto-distribution algorithm — pick the account with the MOST free space
 * that can still hold the file. Balances load across drives naturally.
 *
 * For files larger than any single drive's free space, surfaces a clear
 * error rather than silently failing.
 */
export async function pickAccountForFile(userId: string, sizeBytes: bigint) {
  const accounts = await db.driveAccount.findMany({
    where: { userId },
    select: {
      id: true,
      totalBytes: true,
      email: true,
      displayName: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      driveRootFolderId: true,
    },
  });
  if (accounts.length === 0) {
    throw new Error('Belum ada akun Google Drive yang terhubung. Tambahkan akun terlebih dahulu.');
  }

  const candidates: Array<{
    id: string;
    email: string;
    displayName: string;
    freeBytes: bigint;
    provider: string;
  }> = [];

  for (const acc of accounts) {
    const usage = await getAccountUsage(acc.id);
    if (usage.freeBytes >= sizeBytes) {
      candidates.push({
        id: acc.id,
        email: acc.email,
        displayName: acc.displayName,
        freeBytes: usage.freeBytes,
        provider: acc.provider,
      });
    }
  }

  if (candidates.length === 0) {
    let best: { id: string; email: string; freeBytes: bigint } | null = null;
    for (const acc of accounts) {
      const usage = await getAccountUsage(acc.id);
      if (!best || usage.freeBytes > best.freeBytes) {
        best = { id: acc.id, email: acc.email, freeBytes: usage.freeBytes };
      }
    }
    throw new Error(
      `Tidak ada akun dengan ruang cukup. File butuh ${formatBytes(sizeBytes)}, ` +
      `akun terbesar tersisa ${best ? formatBytes(best.freeBytes) : '0 B'} di ${best?.email}.`
    );
  }

  candidates.sort((a, b) => (a.freeBytes > b.freeBytes ? -1 : 1));
  return candidates[0];
}

/**
 * Store a file blob via the correct provider.
 * - 'google' → Google Drive API
 * - 'local'  → Supabase Storage (production) or local filesystem (dev)
 */
export async function storeFile(
  account: AccountLike,
  file: FileInput
): Promise<{ physicalFileId: string }> {
  if (account.provider === 'google') {
    return googleDriveStoreFile(account, file);
  }
  // For 'local' provider: use Supabase if configured, else local filesystem
  if (isSupabaseConfigured()) {
    return supabaseStoreFile(account.id, file);
  }
  return localStoreFile(account.id, file);
}

/**
 * Read a file blob via the correct provider.
 */
export async function readFile(account: AccountLike, physicalFileId: string): Promise<Buffer> {
  if (account.provider === 'google') {
    return googleDriveReadFile(account, physicalFileId);
  }
  if (isSupabaseConfigured()) {
    return supabaseReadFile(account.id, physicalFileId);
  }
  return localReadFile(account.id, physicalFileId);
}

/**
 * Delete a file blob via the correct provider.
 */
export async function deleteFile(account: AccountLike, physicalFileId: string): Promise<void> {
  if (account.provider === 'google') {
    return googleDriveDeleteFile(account, physicalFileId);
  }
  if (isSupabaseConfigured()) {
    return supabaseDeleteFile(account.id, physicalFileId);
  }
  return localDeleteFile(account.id, physicalFileId);
}

/**
 * Refresh the quota of a 'google' account from the Drive API.
 * For 'local' accounts, this is a no-op (quota is user-set).
 */
export async function refreshAccountQuota(accountId: string): Promise<{
  totalBytes: bigint;
  usedBytes: bigint;
}> {
  const account = await db.driveAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Account not found');

  if (account.provider === 'google') {
    const quota = await fetchGoogleDriveQuota(account);
    // Persist the live quota back to DB so future reads are fast.
    await db.driveAccount.update({
      where: { id: accountId },
      data: { totalBytes: quota.totalBytes },
    });
    return quota;
  }

  // local provider: just return what's stored in DB
  const usage = await getAccountUsage(accountId);
  return { totalBytes: usage.totalBytes, usedBytes: usage.usedBytes };
}

/**
 * Cleanup all physical blobs owned by an account. Called when an account
 * is disconnected. For 'local', removes the bucket directory; for 'google',
 * this is a no-op (we don't delete the user's files from their real Drive
 * unless they explicitly delete each file in the UI).
 */
export async function cleanupAccountStorage(accountId: string): Promise<void> {
  const account = await db.driveAccount.findUnique({
    where: { id: accountId },
    select: { provider: true },
  });
  if (!account) return;

  if (account.provider === 'google') {
    // 'google' files stay in user's real Drive — we don't delete them.
    return;
  }
  // 'local' provider: cleanup via Supabase (if configured) or local filesystem
  if (isSupabaseConfigured()) {
    return supabaseCleanupAccount(accountId);
  }
  return localCleanupAccount(accountId);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatBytes(bytes: bigint | number): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getFileIcon(mimeType: string): { icon: string; color: string } {
  if (mimeType.startsWith('image/')) return { icon: 'image', color: '#a855f7' };
  if (mimeType.startsWith('video/')) return { icon: 'film', color: '#ef4444' };
  if (mimeType.startsWith('audio/')) return { icon: 'music', color: '#f59e0b' };
  if (mimeType === 'application/pdf') return { icon: 'file-text', color: '#dc2626' };
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('rar'))
    return { icon: 'file-archive', color: '#f97316' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv'))
    return { icon: 'sheet', color: '#16a34a' };
  if (mimeType.includes('document') || mimeType.includes('word'))
    return { icon: 'file-text', color: '#2563eb' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return { icon: 'presentation', color: '#ea580c' };
  if (mimeType.startsWith('text/')) return { icon: 'file-text', color: '#64748b' };
  return { icon: 'file', color: '#6b7280' };
}
