'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Trash2,
  RotateCcw,
  Star,
  Pencil,
  FolderPlus,
  ArrowLeftRight,
  Cloud,
  Share2,
  Trash,
  Clock,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ActivityEntry {
  id: string;
  action: string;
  fileName: string | null;
  sizeBytes: string | null;
  details: string | null;
  createdAt: string;
  createdAtFormatted: string;
}

const ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  upload: { icon: Upload, color: '#0A84FF', label: 'Upload' },
  download: { icon: Download, color: '#0A84FF', label: 'Download' },
  delete: { icon: Trash2, color: '#FF3B30', label: 'Trash' },
  restore: { icon: RotateCcw, color: '#34C759', label: 'Restore' },
  permanent_delete: { icon: Trash, color: '#FF3B30', label: 'Hapus Permanen' },
  star: { icon: Star, color: '#FF9500', label: 'Star' },
  unstar: { icon: Star, color: '#8E8E93', label: 'Unstar' },
  rename: { icon: Pencil, color: '#5856D6', label: 'Rename' },
  create_folder: { icon: FolderPlus, color: '#0A84FF', label: 'Folder Baru' },
  migrate: { icon: ArrowLeftRight, color: '#AF52DE', label: 'Migrate' },
  connect_account: { icon: Cloud, color: '#34C759', label: 'Hubungkan Akun' },
  disconnect_account: { icon: Cloud, color: '#FF3B30', label: 'Putus Akun' },
  share: { icon: Share2, color: '#FF9500', label: 'Share' },
  unshare: { icon: Share2, color: '#8E8E93', label: 'Unshare' },
};

interface ActivityViewProps {
  refreshKey: number;
}

export function ActivityView({ refreshKey }: ActivityViewProps) {
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/activity');
      if (!res.ok) throw new Error('Gagal memuat activity');
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Activity Log</h2>
        <p className="text-sm text-muted-foreground">
          Riwayat aktivitas di akun AnsCloud Anda — upload, download, share, delete, dll.
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Memuat activity…
        </div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Belum ada aktivitas</p>
            <p className="text-sm text-muted-foreground">
              Upload, download, atau share file untuk mulai mengisi log.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const meta = ACTION_META[log.action] ?? { icon: Clock, color: '#8E8E93', label: log.action };
            const Icon = meta.icon;
            return (
              <Card key={log.id} className="ios-card">
                <CardContent className="flex items-start gap-3 p-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: meta.color + '20', color: meta.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{meta.label}</span>
                      {log.fileName && (
                        <span className="truncate text-sm text-muted-foreground" title={log.fileName}>
                          · {log.fileName}
                        </span>
                      )}
                    </div>
                    {log.details && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{log.details}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {log.createdAtFormatted}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
