'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeftRight,
  RefreshCw,
  FolderTree,
  File as FileIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckSquare,
  Square,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/file-utils';
import { useMigrationStore, startMigration, completeMigration, failMigration, resetMigration } from '@/lib/migration-store';
import type { MigrationResult } from '@/lib/migration-store';

interface Account {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  provider: string;
  totalBytesFormatted: string;
  usedBytesFormatted: string;
  freeBytesFormatted: string;
  freeBytes: string;
}

interface ScanResult {
  sourceAccount: { id: string; email: string; displayName: string };
  totalFileCount: number;
  totalBytes: string;
  totalBytesFormatted: string;
  folders: Array<{
    folderName: string;
    category: string;
    count: number;
    totalBytes: string;
    totalBytesFormatted: string;
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: string;
      sizeFormatted: string;
      modifiedTime: string;
    }>;
  }>;
}

interface MigrateViewProps {
  accounts: Account[];
  loading: boolean;
  onChanged: () => void;
}

/** Elapsed time formatter */
function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}d`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return `${min}m ${s}d`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return `${hr}j ${m}m`;
}

export function MigrateView({ accounts, loading, onChanged }: MigrateViewProps) {
  const googleAccounts = accounts.filter((a) => a.provider === 'google');
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [deleteOriginals, setDeleteOriginals] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  // ── Global migration state (persists across tab switches) ──
  const migration = useMigrationStore();
  const isRunning = migration.status === 'running';
  const isDone = migration.status === 'done' || migration.status === 'error';

  // Elapsed timer while running
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!isRunning || !migration.startedAt) { setElapsed(''); return; }
    const tick = () => setElapsed(formatElapsed(Date.now() - migration.startedAt!));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, migration.startedAt]);

  // When migration completes while user is on this page, sync local state
  useEffect(() => {
    if (migration.status === 'done' && migration.result) {
      toast({ title: 'Migrasi selesai', description: `${migration.result.migrated} file dipindah, ${migration.result.skipped} dilewati, ${migration.result.failed} gagal.` });
      onChanged?.();
    }
    if (migration.status === 'error' && migration.error) {
      toast({ title: 'Migrasi gagal', description: migration.error, variant: 'destructive' });
    }
  // Only react to status changes, not onChanged
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migration.status]);

  // Auto-select first Google account when list loads
  const ensureSourceId = useCallback(() => {
    if (!sourceId && googleAccounts.length > 0) setSourceId(googleAccounts[0].id);
    if (!targetId && googleAccounts.length > 0) setTargetId(googleAccounts[0].id);
  }, [sourceId, targetId, googleAccounts]);
  void ensureSourceId;

  async function handleScan() {
    if (!sourceId) { toast({ title: 'Pilih akun sumber', variant: 'destructive' }); return; }
    setScanning(true); setScanResult(null); resetMigration(); setSelectedFileIds(new Set());
    try {
      const res = await fetch('/api/migrate-gdrive/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceAccountId: sourceId }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal scan'); }
      const data = (await res.json()) as ScanResult;
      setScanResult(data);
      setSelectedCategories(new Set(data.folders.map((f) => f.folderName)));
      const allIds = new Set<string>();
      data.folders.forEach((f) => f.files.forEach((fi) => allIds.add(fi.id)));
      setSelectedFileIds(allIds);
      if (data.folders.length > 0) setExpandedFolders(new Set([data.folders[0].folderName]));
    } catch (e) {
      toast({ title: 'Gagal scan', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally { setScanning(false); }
  }

  async function handleRun() {
    if (!sourceId || !targetId) { toast({ title: 'Pilih akun sumber & tujuan', variant: 'destructive' }); return; }
    if (sourceId === targetId && deleteOriginals) {
      toast({ title: 'Mode reorganize', description: 'Sumber & tujuan sama — file dipindah ke folder, bukan dihapus.' });
    }
    if (selectedFileIds.size === 0) { toast({ title: 'Pilih minimal 1 file', variant: 'destructive' }); return; }
    if (sourceId !== targetId && deleteOriginals && !confirm(
      `Anda yakin ingin MENGHAPUS ${selectedFileIds.size} file asli setelah dicopy? Tindakan ini tidak bisa dibatalkan.`
    )) return;

    // Update global store — keeps running even if user navigates away
    startMigration(selectedFileIds.size);

    try {
      const res = await fetch('/api/migrate-gdrive/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId: sourceId, targetAccountId: targetId,
          fileIds: Array.from(selectedFileIds),
          folderCategories: Array.from(selectedCategories),
          deleteOriginals: sourceId !== targetId ? deleteOriginals : false,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal run migrate'); }
      const data = (await res.json()) as MigrationResult;
      completeMigration(data);
      onChanged?.();
    } catch (e) {
      failMigration(e instanceof Error ? e.message : 'Gagal migrasi');
    }
  }

  function toggleFolder(name: string) {
    setExpandedFolders((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }

  function toggleCategory(name: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name);
      if (scanResult) {
        const folder = scanResult.folders.find((f) => f.folderName === name);
        if (folder) {
          setSelectedFileIds((prevIds) => {
            const nextIds = new Set(prevIds);
            if (next.has(name)) { folder.files.forEach((f) => nextIds.delete(f.id)); }
            else { folder.files.forEach((f) => nextIds.add(f.id)); }
            return nextIds;
          });
        }
      }
      return next;
    });
  }

  function toggleFile(fileId: string) {
    setSelectedFileIds((prev) => { const next = new Set(prev); if (next.has(fileId)) next.delete(fileId); else next.add(fileId); return next; });
  }

  function selectAllFiles() {
    if (!scanResult) return;
    const allIds = new Set<string>();
    scanResult.folders.forEach((f) => f.files.forEach((fi) => allIds.add(fi.id)));
    setSelectedFileIds(allIds);
    setSelectedCategories(new Set(scanResult.folders.map((f) => f.folderName)));
  }

  function deselectAllFiles() {
    setSelectedFileIds(new Set()); setSelectedCategories(new Set());
  }

  const totalSelectedFiles = selectedFileIds.size;

  // Empty state: no Google accounts
  if (!loading && googleAccounts.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><ArrowLeftRight className="h-7 w-7 text-muted-foreground" /></div>
            <div>
              <p className="font-medium">Belum ada akun Google Asli terhubung</p>
              <p className="text-sm text-muted-foreground">Migrate GDrive hanya bekerja untuk akun Google Asli (via OAuth). Hubungkan minimal 1 akun Google di tab &quot;Akun Google&quot; terlebih dahulu.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Migrate GDrive</h2>
        <p className="text-sm text-muted-foreground">Pindahkan file dari satu akun Google Drive ke akun lain, atau reorganize file di akun yang sama. Centang file/folder yang ingin dipindahkan.</p>
      </div>

      {/* ── Background migration status (shown when returning to this tab) ── */}
      {isRunning && (
        <Card className="mb-6 border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-blue-800 dark:text-blue-200">Migrasi sedang berjalan…</p>
              <p className="text-sm text-blue-600 dark:text-blue-300">{migration.totalFiles} file · {elapsed && `sudah berjalan ${elapsed}`}</p>
            </div>
            <p className="text-xs text-blue-500">Anda bisa pindah halaman, proses akan tetap berjalan.</p>
          </CardContent>
        </Card>
      )}

      {/* Setup card */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Konfigurasi Migrasi</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Akun Sumber</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pilih akun sumber…" /></SelectTrigger>
                <SelectContent>
                  {googleAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.avatarColor }} />
                        <span className="font-medium">{a.displayName}</span>
                        <span className="text-xs text-muted-foreground">({a.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Akun Tujuan</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pilih akun tujuan…" /></SelectTrigger>
                <SelectContent>
                  {googleAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.avatarColor }} />
                        <span className="font-medium">{a.displayName}</span>
                        <span className="text-xs text-muted-foreground">({a.freeBytesFormatted} bebas)</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={handleScan} disabled={scanning || !sourceId || isRunning} variant="outline">
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Scan Files
            </Button>
            <div className="flex items-center gap-2">
              <Switch id="delete-originals" checked={deleteOriginals} onCheckedChange={setDeleteOriginals} disabled={sourceId === targetId || isRunning} />
              <Label htmlFor="delete-originals" className="cursor-pointer text-sm">Hapus file asli setelah copy</Label>
            </div>
            {sourceId === targetId && sourceId !== '' && (
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Mode: Reorganize</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Scan results */}
      {scanResult && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Hasil Scan</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {scanResult.totalFileCount} file · {scanResult.totalBytesFormatted} · dari <strong>{scanResult.sourceAccount.displayName}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllFiles} disabled={isRunning}>Pilih Semua</Button>
                <Button variant="outline" size="sm" onClick={deselectAllFiles} disabled={isRunning}>Batal Pilih</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {scanResult.folders.map((folder) => {
              const expanded = expandedFolders.has(folder.folderName);
              const folderFileIds = folder.files.map((f) => f.id);
              const allFilesSelected = folderFileIds.every((id) => selectedFileIds.has(id));
              const someFilesSelected = folderFileIds.some((id) => selectedFileIds.has(id));
              const iconMeta = getFolderIcon(folder.folderName);
              return (
                <div key={folder.folderName} className="rounded-md border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <button
                      onClick={() => toggleCategory(folder.folderName)}
                      disabled={isRunning}
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
                        allFilesSelected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : someFilesSelected
                            ? 'border-emerald-600 bg-emerald-100'
                            : 'border-muted-foreground/30 hover:border-muted-foreground'
                      )}
                      title={allFilesSelected ? 'Batal pilih semua' : 'Pilih semua'}
                    >
                      {allFilesSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : someFilesSelected ? <CheckSquare className="h-3.5 w-3.5 text-emerald-600" /> : null}
                    </button>
                    <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ color: iconMeta.color }}>
                      <FolderTree className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{folder.folderName}</span>
                        <span className="text-xs text-muted-foreground">{folder.count} file · {folder.totalBytesFormatted}</span>
                        {someFilesSelected && !allFilesSelected && (
                          <span className="text-xs text-emerald-600">{folderFileIds.filter((id) => selectedFileIds.has(id)).length}/{folder.count} dipilih</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => toggleFolder(folder.folderName)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent" title={expanded ? 'Tutup' : 'Lihat file'}>
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                  {expanded && (
                    <div className="max-h-72 overflow-y-auto border-t bg-muted/20">
                      {folder.files.map((file) => {
                        const fIcon = getFileIcon(file.mimeType);
                        const fileSelected = selectedFileIds.has(file.id);
                        return (
                          <div
                            key={file.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 text-sm border-b last:border-b-0 cursor-pointer hover:bg-muted/60 transition-colors',
                              fileSelected && 'bg-emerald-50/60 dark:bg-emerald-950/20'
                            )}
                            onClick={() => !isRunning && toggleFile(file.id)}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); !isRunning && toggleFile(file.id); }}
                              disabled={isRunning}
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                                fileSelected
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-muted-foreground/30 hover:border-muted-foreground'
                              )}
                            >
                              {fileSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </button>
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center" style={{ color: fIcon.color }}>
                              <FileIcon className="h-4 w-4" />
                            </div>
                            <span className="truncate flex-1" title={file.name}>{file.name}</span>
                            <span className="text-xs text-muted-foreground">{file.sizeFormatted}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(file.modifiedTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={handleRun}
                disabled={isRunning || totalSelectedFiles === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
                {isRunning ? `Memigrasi… ${elapsed}` : `Migrasi ${totalSelectedFiles} file`}
              </Button>
              <span className="text-xs text-muted-foreground">
                {totalSelectedFiles} dari {scanResult.totalFileCount} file dipilih
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run results (from global store) */}
      {isDone && migration.result && (
        <Card className={cn(migration.result.failed > 0 ? 'border-amber-300' : 'border-emerald-300')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                {migration.result.failed > 0 ? <AlertCircle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                Hasil Migrasi
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => resetMigration()}>Tutup</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox label="Dipindah" value={migration.result.migrated} color="text-emerald-600" />
              <StatBox label="Dilewati" value={migration.result.skipped} color="text-blue-600" />
              <StatBox label="Gagal" value={migration.result.failed} color="text-rose-600" />
              <StatBox label="Total Bytes" value={migration.result.totalBytesMigratedFormatted ?? migration.result.totalBytesMigrated} color="text-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Mode: <strong>{migration.result.mode}</strong>{migration.result.message ? ` · ${migration.result.message}` : ''}</p>
            {migration.result.errors && migration.result.errors.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
                <p className="mb-2 text-xs font-medium text-rose-700 dark:text-rose-300">{migration.result.errors.length} error terjadi:</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-rose-700 dark:text-rose-300">
                  {migration.result.errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-2"><Trash2 className="mt-0.5 h-3 w-3 shrink-0" /><span><strong>{e.fileName}</strong>: {e.error}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error state from global store */}
      {migration.status === 'error' && !migration.result && (
        <Card className="border-rose-300">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-rose-600" />
            <div className="flex-1">
              <p className="font-medium text-rose-700 dark:text-rose-300">Migrasi gagal</p>
              <p className="text-sm text-rose-600 dark:text-rose-400">{migration.error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => resetMigration()}>Tutup</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-bold', color)}>{value}</div>
    </div>
  );
}

function getFolderIcon(folderName: string): { color: string } {
  const colors: Record<string, string> = { PDF: '#dc2626', Word: '#2563eb', Excel: '#16a34a', Powerpoint: '#ea580c', Images: '#a855f7', Video: '#ef4444', Audio: '#f59e0b', Archive: '#f97316', Code: '#0891b2', Text: '#64748b', Others: '#6b7280' };
  return { color: colors[folderName] ?? '#6b7280' };
}