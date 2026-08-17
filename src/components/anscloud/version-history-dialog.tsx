'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { History, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Version {
  versionNumber: number;
  sizeBytes: string;
  sizeFormatted: string;
  mimeType: string;
  createdAt: string;
  createdAtFormatted: string;
  isCurrent: boolean;
}

interface VersionHistoryDialogProps {
  file: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}

export function VersionHistoryDialog({
  file,
  open,
  onOpenChange,
  onRestored,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${file.id}/versions`);
      if (!res.ok) throw new Error('Gagal memuat versions');
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch (e) {
      toast({
        title: 'Gagal memuat version history',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [file, toast]);

  useEffect(() => {
    if (open && file) {
      load();
    } else {
      setVersions([]);
    }
  }, [open, file, load]);

  async function handleRestore(versionNumber: number) {
    if (!file) return;
    if (!confirm(`Restore file "${file.name}" ke versi ${versionNumber}? Versi saat ini akan disimpan ke history.`)) {
      return;
    }
    setRestoring(versionNumber);
    try {
      const res = await fetch(`/api/files/${file.id}/restore-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionNumber }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal restore versi');
      }
      toast({
        title: 'Berhasil',
        description: `File direstore ke versi ${versionNumber}. Versi baru sekarang aktif.`,
      });
      onRestored();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Gagal restore',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            Riwayat versi untuk <strong>{file.name}</strong>. Setiap upload file dengan nama yang
            sama otomatis membuat versi baru. Klik &quot;Restore&quot; untuk mengembalikan versi lama.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memuat version history…
          </div>
        ) : versions.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Tidak ada versi lain.</p>
            <p className="text-xs">Upload ulang file ini untuk membuat versi baru.</p>
          </div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {versions.map((v) => (
              <div
                key={v.versionNumber}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                  v.isCurrent
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                    : 'border-border hover:bg-accent/50'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    v.isCurrent
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  v{v.versionNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Versi {v.versionNumber}
                    </span>
                    {v.isCurrent && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        AKTIF
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.sizeFormatted} · {v.createdAtFormatted}
                  </div>
                </div>
                {!v.isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(v.versionNumber)}
                    disabled={restoring === v.versionNumber}
                    className="ios-pressable"
                  >
                    {restoring === v.versionNumber ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    )}
                    Restore
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
