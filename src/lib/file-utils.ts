/**
 * Pure utility functions for file display — safe to import from client components.
 * DO NOT import any server-only code (no googleapis, no Prisma) here.
 */

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
