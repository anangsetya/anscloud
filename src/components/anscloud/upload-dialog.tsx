'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  UploadCloud,
  X,
  File as FileIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Hand,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type UploadMode = 'auto' | 'manual';

interface Account {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  totalBytes: string;
  usedBytes: string;
  freeBytes: string;
  usedPct: number;
  totalBytesFormatted: string;
  usedBytesFormatted: string;
  freeBytesFormatted: string;
  fileCount: number;
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFolderId: string | null;
  onUploaded: () => void;
  accounts: Account[];
  mode: UploadMode;
  onModeChange: (mode: UploadMode) => void;
  manualDriveId: string | null;
  onManualDriveChange: (id: string | null) => void;
}

interface UploadTask {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  driveAccount?: { email: string; color: string; displayName: string; mode: string };
}

export function UploadDialog({
  open,
  onOpenChange,
  currentFolderId,
  onUploaded,
  accounts,
  mode,
  onModeChange,
  manualDriveId,
  onManualDriveChange,
}: UploadDialogProps) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  // Reset tasks when dialog closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setTasks([]), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset manual drive selection if it's no longer valid (e.g., account deleted).
  useEffect(() => {
    if (mode === 'manual' && manualDriveId && !accounts.find((a) => a.id === manualDriveId)) {
      onManualDriveChange(accounts[0]?.id ?? null);
    }
  }, [accounts, mode, manualDriveId, onManualDriveChange]);

  // Default manualDriveId to first account when switching to manual mode.
  useEffect(() => {
    if (mode === 'manual' && !manualDriveId && accounts.length > 0) {
      onManualDriveChange(accounts[0].id);
    }
  }, [mode, manualDriveId, accounts, onManualDriveChange]);

  const canUpload = mode === 'auto' || (mode === 'manual' && !!manualDriveId);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;

      if (mode === 'manual' && !manualDriveId) {
        toast({
          title: 'Pilih drive dulu',
          description: 'Mode manual aktif tapi belum ada akun dipilih. Pilih akun tujuan di dropdown.',
          variant: 'destructive',
        });
        return;
      }

      const newTasks: UploadTask[] = arr.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: 'pending' as const,
        progress: 0,
      }));
      setTasks((prev) => [...prev, ...newTasks]);
      arr.forEach((file, idx) => {
        const taskId = newTasks[idx].id;
        void runUpload(taskId, file);
      });
    },
    [mode, manualDriveId, toast]
  );

  /**
   * Handle drop events: detect whether the user dropped a folder (using the
   * non-standard DataTransferItem.webkitGetAsEntry() API). If it's a folder,
   * recursively traverse it and collect all files with their relative paths,
   * then send them to /api/upload-folder which creates the folder structure.
   */
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      if (!items || items.length === 0) {
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        return;
      }

      // Detect if any dropped item is a directory.
      const entries: Array<{ entry: FileSystemEntry; path: string }> = [];
      let hasDirectory = false;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const entry = item.webkitGetAsEntry?.();
        if (!entry) continue;
        if (entry.isDirectory) hasDirectory = true;
        entries.push({ entry, path: entry.name });
      }

      if (hasDirectory) {
        // Recursively collect all files from the dropped folders.
        const collected: Array<{ file: File; path: string }> = [];
        for (const { entry } of entries) {
          try {
            await traverseEntry(entry, '', collected);
          } catch (err) {
            toast({
              title: 'Gagal membaca folder',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'destructive',
            });
          }
        }
        if (collected.length === 0) {
          toast({
            title: 'Folder kosong',
            description: 'Tidak ada file yang bisa diupload dari folder yang di-drop.',
            variant: 'destructive',
          });
          return;
        }
        await uploadFolder(collected);
      } else {
        // Regular file drop — fall back to addFiles.
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
      }
    },
    [addFiles, toast, currentFolderId]
  );

  /** Recursively walk a FileSystemEntry, collecting all files with their full paths. */
  function traverseEntry(
    entry: FileSystemEntry,
    parentPath: string,
    collected: Array<{ file: File; path: string }>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        fileEntry.file(
          (file) => {
            // Hack: rename the File to carry its relative path via `name`.
            // The /api/upload-folder endpoint reads the name as the relative path.
            const renamed = new File([file], path, { type: file.type, lastModified: file.lastModified });
            collected.push({ file: renamed, path });
            resolve();
          },
          (err) => reject(err)
        );
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        const readEntries = () => {
          reader.readEntries(
            async (entries) => {
              if (entries.length === 0) {
                resolve();
                return;
              }
              try {
                for (const childEntry of entries) {
                  await traverseEntry(childEntry, path, collected);
                }
                // Continue reading — readEntries only returns up to 100 at a time.
                readEntries();
              } catch (err) {
                reject(err);
              }
            },
            (err) => reject(err)
          );
        };
        readEntries();
      } else {
        resolve();
      }
    });
  }

  /** Upload a folder's worth of files, preserving the directory structure. */
  async function uploadFolder(collected: Array<{ file: File; path: string }>) {
    if (mode === 'manual' && !manualDriveId) {
      toast({
        title: 'Pilih drive dulu',
        description: 'Mode manual aktif tapi belum ada akun dipilih.',
        variant: 'destructive',
      });
      return;
    }

    const taskId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTasks((prev) =>
      [
        ...prev,
        {
          id: taskId,
          file: new File([], `Folder upload (${collected.length} files)`),
          status: 'uploading' as const,
          progress: 0,
        },
      ]
    );

    try {
      const formData = new FormData();
      collected.forEach((f) => formData.append('files', f.file));
      formData.append('paths', JSON.stringify(collected.map((f) => f.path)));
      if (currentFolderId) formData.append('folderId', currentFolderId);
      if (mode === 'manual' && manualDriveId) {
        // For folder upload, manual mode is handled per-file in the API,
        // but we can't currently pass a target account through. Fall back
        // to auto-distribution for folder uploads.
        // (Could be enhanced later to pass a single account for all files.)
      }

      // Use XHR for progress tracking (rough — based on number of files done).
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.max(10, Math.min(90, Math.round((e.loaded / e.total) * 90)));
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, progress: pct, error: `Mengupload folder (${collected.length} files)...` } : t
              )
            );
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        status: 'success' as const,
                        progress: 100,
                        error: undefined,
                        driveAccount: {
                          email: '',
                          displayName: `${json.uploaded || 0} file diupload`,
                          color: '#0A84FF',
                          mode: 'folder',
                        },
                      }
                    : t
                )
              );
              onUploaded();
              resolve();
            } catch {
              reject(new Error('Respons server tidak valid'));
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error ?? `Upload gagal (${xhr.status})`));
            } catch {
              reject(new Error(`Upload gagal (${xhr.status})`));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Koneksi gagal')));
        xhr.open('POST', '/api/upload-folder');
        xhr.send(formData);
      });
    } catch (e) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'error' as const, error: e instanceof Error ? e.message : 'Unknown error' }
            : t
        )
      );
      toast({
        title: 'Gagal upload folder',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function runUpload(taskId: string, file: File) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'uploading', progress: 5 } : t))
    );

    try {
      // Route to chunked upload for files > 50 MB (Cloudflare free plan limit).
      // Otherwise use the simple /api/upload endpoint.
      const CHUNK_THRESHOLD = 50 * 1024 * 1024; // 50 MB
      if (file.size > CHUNK_THRESHOLD) {
        await runChunkedUpload(taskId, file);
      } else {
        await runSimpleUpload(taskId, file);
      }
      onUploaded();
    } catch (e) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'error', error: e instanceof Error ? e.message : 'Unknown error' }
            : t
        )
      );
      toast({
        title: `Gagal upload: ${file.name}`,
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  /** Simple upload (single request) for files ≤ 50 MB. */
  async function runSimpleUpload(taskId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId) formData.append('folderId', currentFolderId);
    if (mode === 'manual' && manualDriveId) {
      formData.append('driveAccountId', manualDriveId);
    }

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.max(10, Math.min(90, Math.round((e.loaded / e.total) * 90)));
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, progress: pct } : t))
          );
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            const dist = json.distribution ?? {};
            const account = accounts.find((a) => a.id === dist.driveAccountId);
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'success',
                      progress: 100,
                      driveAccount: {
                        email: dist.driveAccountEmail ?? '',
                        displayName: dist.driveAccountName ?? '',
                        color: account?.avatarColor ?? '#0A84FF',
                        mode: dist.mode ?? mode,
                      },
                    }
                  : t
              )
            );
            resolve();
          } catch {
            reject(new Error('Respons server tidak valid'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error ?? `Upload gagal (${xhr.status})`));
          } catch {
            reject(new Error(`Upload gagal (${xhr.status})`));
          }
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Koneksi gagal')));
      xhr.addEventListener('abort', () => reject(new Error('Dibatalkan')));
      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  }

  /** Chunked upload for files > 50 MB. Splits into 5 MB chunks, uploads each
   *  sequentially (to avoid hammering the server), then finalize. */
  async function runChunkedUpload(taskId: string, file: File) {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB — must match server
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init session
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, progress: 5, error: `Menginisialisasi chunked upload (${totalChunks} chunks)...` } : t))
    );
    const initRes = await fetch('/api/upload/chunk/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        folderId: currentFolderId,
        driveAccountId: mode === 'manual' ? manualDriveId : undefined,
        totalChunks,
      }),
    });
    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.error ?? `Init gagal (${initRes.status})`);
    }
    const { uploadId } = await initRes.json();

    // 2. Upload each chunk sequentially with retry
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);

      let attempt = 0;
      let ok = false;
      while (attempt < 3 && !ok) {
        attempt++;
        try {
          const formData = new FormData();
          formData.append('uploadId', uploadId);
          formData.append('chunkIndex', String(i));
          formData.append('chunk', chunkBlob, `chunk_${i}`);

          const res = await fetch('/api/upload/chunk/upload', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? `Chunk ${i + 1}/${totalChunks} gagal`);
          }
          ok = true;
        } catch (e) {
          if (attempt >= 3) throw e;
          // Exponential backoff before retry
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }

      // Update progress: 5% init, 5-90% chunks, 90-100% finalize
      const pct = Math.round(5 + (i + 1) / totalChunks * 85);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, progress: pct, error: `Chunk ${i + 1}/${totalChunks} terkirim` }
            : t
        )
      );
    }

    // 3. Finalize — combine chunks, create VirtualFile, cleanup
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, progress: 92, error: 'Menggabungkan chunks...' } : t))
    );
    const finalizeRes = await fetch('/api/upload/chunk/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });
    if (!finalizeRes.ok) {
      const err = await finalizeRes.json().catch(() => ({}));
      throw new Error(err.error ?? `Finalize gagal (${finalizeRes.status})`);
    }
    const data = await finalizeRes.json();
    const account = accounts.find((a) => a.id === data.distribution?.driveAccountId);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'success',
              progress: 100,
              error: undefined,
              driveAccount: {
                email: data.distribution?.driveAccountEmail ?? '',
                displayName: data.distribution?.driveAccountName ?? '',
                color: account?.avatarColor ?? '#0A84FF',
                mode: 'chunked',
              },
            }
          : t
      )
    );
  }


  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  const hasActive = tasks.some((t) => t.status === 'uploading' || t.status === 'pending');

  return (
    <Dialog open={open} onOpenChange={(o) => !hasActive && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Pilih mode distribusi: <strong>Auto</strong> untuk sistem pilih otomatis, atau{' '}
            <strong>Manual</strong> untuk pilih drive tujuan sendiri.
          </DialogDescription>
        </DialogHeader>

        {/* Mode selector */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === 'auto'}
              onClick={() => onModeChange('auto')}
              icon={<Zap className="h-4 w-4" />}
              title="Auto"
              description="Sistem pilih drive dengan ruang kosong terbanyak"
            />
            <ModeButton
              active={mode === 'manual'}
              onClick={() => onModeChange('manual')}
              icon={<Hand className="h-4 w-4" />}
              title="Manual"
              description="Anda pilih drive tujuan sendiri"
            />
          </div>

          {mode === 'manual' && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                Drive Tujuan
              </label>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada akun terhubung. Tambahkan akun dulu di tab &quot;Akun Google&quot;.
                </p>
              ) : (
                <Select
                  value={manualDriveId ?? ''}
                  onValueChange={(v) => onManualDriveChange(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih akun Google Drive…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: a.avatarColor }}
                          />
                          <span className="font-medium">{a.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            ({a.email}) · {a.freeBytesFormatted} bebas
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {manualDriveId && (
                <p className="text-[11px] text-muted-foreground">
                  File akan diupload ke akun ini. Jika ruang tidak cukup, upload akan gagal
                  dengan pesan error yang jelas.
                </p>
              )}
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            isDragging
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-muted-foreground/30 hover:border-muted-foreground/50',
            !canUpload && 'pointer-events-none opacity-50'
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UploadCloud className="h-7 w-7" />
          </div>
          <div>
            <p className="font-medium">Tarik file atau folder ke sini</p>
            <p className="text-sm text-muted-foreground">
              {mode === 'auto'
                ? 'Folder akan otomatis diupload dengan struktur folder tetap terjaga. File otomatis didistribusikan ke akun dengan ruang kosong terbanyak.'
                : manualDriveId
                  ? `File akan diupload ke akun yang Anda pilih di atas.`
                  : 'Pilih drive tujuan dulu di atas sebelum upload.'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!canUpload}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.onchange = () => {
                if (input.files) addFiles(input.files);
              };
              input.click();
            }}
          >
            Pilih File
          </Button>
        </div>

        {tasks.length > 0 && (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onRemove={() => removeTask(t.id)} />
            ))}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {tasks.filter((t) => t.status === 'success').length}/{tasks.length} berhasil
              {hasActive ? ' · mengunggah…' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={hasActive}
            >
              Tutup
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
        active
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
          : 'border-border hover:bg-accent'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            active ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
          )}
        >
          {icon}
        </span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <span className="text-[11px] text-muted-foreground">{description}</span>
    </button>
  );
}

function TaskRow({ task, onRemove }: { task: UploadTask; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <FileIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task.file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatBytes(task.file.size)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                task.status === 'error'
                  ? 'bg-rose-500'
                  : task.status === 'success'
                    ? 'bg-emerald-500'
                    : 'bg-primary'
              )}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="w-9 text-right text-[11px] text-muted-foreground">
            {task.status === 'success' ? '✓' : task.status === 'error' ? '!' : `${task.progress}%`}
          </span>
        </div>
        {task.status === 'success' && task.driveAccount && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span>
              Disimpan ke{' '}
              <span className="font-medium text-foreground">{task.driveAccount.displayName}</span>{' '}
              ({task.driveAccount.email})
              {task.driveAccount.mode === 'manual' && (
                <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                  manual
                </span>
              )}
              {task.driveAccount.mode === 'auto' && (
                <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  auto
                </span>
              )}
            </span>
          </div>
        )}
        {task.status === 'error' && (
          <div className="flex items-center gap-1.5 text-[11px] text-rose-600">
            <AlertCircle className="h-3 w-3" />
            <span>{task.error}</span>
          </div>
        )}
        {task.status === 'uploading' && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Mengunggah & menentukan drive tujuan…</span>
          </div>
        )}
      </div>
      {task.status !== 'uploading' && task.status !== 'pending' && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
