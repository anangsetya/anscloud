'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  Mail,
  HardDrive,
  AlertCircle,
  Loader2,
  Cloud,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Account {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  provider: string;
  totalBytes: string;
  usedBytes: string;
  freeBytes: string;
  usedPct: number;
  totalBytesFormatted: string;
  usedBytesFormatted: string;
  freeBytesFormatted: string;
  fileCount: number;
  createdAt: string;
}

interface AccountsManagerProps {
  accounts: Account[];
  loading: boolean;
  onChanged: () => void;
}

export function AccountsManager({ accounts, loading, onChanged }: AccountsManagerProps) {
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/accounts/oauth-status')
      .then((r) => r.json())
      .then((d) => setOauthConfigured(!!d.configured))
      .catch(() => setOauthConfigured(false));
  }, []);

  const handleConnectGoogle = useCallback(() => {
    window.location.href = '/api/auth/google/login?returnTo=/?view=accounts';
  }, []);

  const handleReconnect = useCallback((accountId: string) => {
    // Delete the old account first (metadata only, files stay in Drive)
    fetch(`/api/accounts?id=${accountId}`, { method: 'DELETE' })
      .then((res) => {
        if (!res.ok) throw new Error('Gagal menghapus akun lama');
        // Then redirect to OAuth flow — callback will create a fresh account
        window.location.href = '/api/auth/google/login?returnTo=/?view=accounts';
      })
      .catch((e) => {
        toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
      });
  }, [toast]);

  const handleRefreshQuota = useCallback(
    async (accountId: string) => {
      setRefreshingId(accountId);
      try {
        const res = await fetch(`/api/accounts/refresh-quota?id=${accountId}`, { method: 'POST' });
        if (!res.ok) throw new Error('Gagal memeriksa kuota');
        const data = await res.json();
        toast({ title: 'Kuota diperbarui', description: `${data.usedBytesFormatted} / ${data.totalBytesFormatted}` });
        onChanged();
      } catch (e) {
        toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
      } finally {
        setRefreshingId(null);
      }
    },
    [onChanged, toast]
  );

  const handleSyncDrive = useCallback(
    async (accountId: string) => {
      setSyncingId(accountId);
      try {
        const res = await fetch('/api/accounts/sync-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });
        const data = await res.json();
        if (!res.ok) {
          // Detect scope error and suggest reconnecting
          const errMsg = data.error || 'Gagal sinkronisasi';
          if (errMsg.includes('insufficient authentication scopes')) {
            toast({
              title: 'Sync gagal — Scope tidak cukup',
              description: 'Token OAuth tidak punya akses Drive. Klik tombol "Hubungkan Ulang" pada akun ini untuk memperbaiki.',
              variant: 'destructive',
              action: {
                label: 'Hubungkan Ulang',
                onClick: () => handleReconnect(accountId),
              },
            });
            return;
          }
          throw new Error(errMsg);
        }
        toast({
          title: 'Sinkronisasi selesai',
          description: `${data.created} file baru, ${data.updated} diperbarui dari ${data.syncableFiles} file.`,
        });
        onChanged();
      } catch (e) {
        toast({ title: 'Sync gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
      } finally {
        setSyncingId(null);
      }
    },
    [onChanged, toast, handleReconnect]
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Akun Google Drive</h2>
          <p className="text-sm text-muted-foreground">Hubungkan akun Google Drive untuk menambah kapasitas storage.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGuide(!showGuide)}>
            <Cloud className="mr-2 h-4 w-4" />
            Panduan Setup
          </Button>
          <Button size="sm" onClick={handleConnectGoogle} disabled={oauthConfigured === false}>
            {oauthConfigured === false ? (
              <AlertCircle className="mr-2 h-4 w-4" />
            ) : (
              <Cloud className="mr-2 h-4 w-4" />
            )}
            Hubungkan Akun
          </Button>
        </div>
      </div>

      {oauthConfigured === false && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Google OAuth belum dikonfigurasi. Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">GOOGLE_CLIENT_ID</code> & <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">GOOGLE_CLIENT_SECRET</code> di environment variables, lalu ikuti panduan di bawah.
            </p>
          </CardContent>
        </Card>
      )}

      {showGuide && <SetupGuide />}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Memuat akun…</div>
      ) : accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <HardDrive className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Belum ada akun terhubung</p>
              <p className="text-sm text-muted-foreground">Klik &quot;Hubungkan Akun&quot; untuk menambahkan Google Drive.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onDelete={() => setDeleteTarget(acc)}
              onRefreshQuota={handleRefreshQuota}
              onSyncDrive={handleSyncDrive}
              onReconnect={() => handleReconnect(acc.id)}
              refreshing={refreshingId === acc.id}
              syncing={syncingId === acc.id}
            />
          ))}
        </div>
      )}

      <DeleteConfirm
        account={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const res = await fetch(`/api/accounts?id=${deleteTarget.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Gagal menghapus akun');
            toast({ title: 'Berhasil', description: `Akun "${deleteTarget.displayName}" dihapus.` });
            setDeleteTarget(null);
            onChanged();
          } catch (e) {
            toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
          }
        }}
      />
    </div>
  );
}

/* ── Setup Guide ────────────────────────────────────── */

function SetupGuide() {
  const [open, setOpen] = useState(true);
  return (
    <Card className="mb-6">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-5 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Cloud className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold">Cara Menghubungkan Akun Google Drive</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <CardContent className="px-5 pb-5 pt-0">
          <ol className="ml-5 list-decimal space-y-3 text-sm text-muted-foreground">
            <li>
              Buka{' '}
              <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="link-blue">
                Google Cloud Console <ExternalLink className="inline h-3 w-3" />
              </a>{' '}
              → buat project baru.
            </li>
            <li>
              <strong>APIs & Services → Library</strong> → cari & enable <strong>Google Drive API</strong>.
            </li>
            <li>
              <strong>APIs & Services → OAuth consent screen</strong> → pilih <strong>External</strong> → isi nama app &quot;AnsCloud&quot; → tambahkan scopes:{' '}
              <code className="rounded bg-muted px-1">auth/drive</code>,{' '}
              <code className="rounded bg-muted px-1">userinfo.email</code>,{' '}
              <code className="rounded bg-muted px-1">userinfo.profile</code>.
            </li>
            <li>
              <strong>APIs & Services → Credentials</strong> → <strong>Create OAuth 2.0 Client ID</strong> (Web application) → Authorized Redirect URI:
              <code className="ml-1 rounded bg-muted px-1">https://domain-anda.com/api/auth/google/callback</code>
            </li>
            <li>
              Set 3 environment variables di Vercel:
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                <code>{`GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
ANSCLOUD_PUBLIC_URL=https://domain-anda.com`}</code>
              </pre>
            </li>
            <li>Redeploy di Vercel → tombol <strong>Hubungkan Akun</strong> akan aktif → klik → login Google → selesai.</li>
          </ol>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <strong>Perhatian:</strong> Scope <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">auth/drive</code> memberikan akses penuh ke semua file di Drive Anda. Cabut akses kapan saja di{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline">
              myaccount.google.com/permissions
            </a>.
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ── Account Card ───────────────────────────────────── */

function AccountCard({
  account,
  onDelete,
  onRefreshQuota,
  onSyncDrive,
  onReconnect,
  refreshing,
  syncing,
}: {
  account: Account;
  onDelete: () => void;
  onRefreshQuota: (id: string) => void;
  onSyncDrive: (id: string) => void;
  onReconnect: () => void;
  refreshing: boolean;
  syncing: boolean;
}) {
  const colorClass = account.usedPct > 85 ? 'bg-rose-500' : account.usedPct > 65 ? 'bg-amber-500' : 'bg-primary';
  const isGoogle = account.provider === 'google';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: account.avatarColor }}
          >
            {account.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-base">{account.displayName}</CardTitle>
              {isGoogle && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <Cloud className="h-2.5 w-2.5" />Google
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />{account.email}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {isGoogle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onSyncDrive(account.id)}
                disabled={syncing || refreshing}
                title="Sinkronisasi file dari Drive"
              >
                <RefreshCcw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              </Button>
            )}
            {isGoogle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRefreshQuota(account.id)}
                disabled={refreshing || syncing}
                title="Refresh kuota"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              </Button>
            )}
            {isGoogle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-600"
                onClick={onReconnect}
                disabled={syncing || refreshing}
                title="Hubungkan ulang akun (fix scope error)"
              >
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-rose-600"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isGoogle && syncing && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Menyinkronisasi file dari Google Drive…</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Terpakai</span>
          <span className="font-medium">{account.usedBytesFormatted} / {account.totalBytesFormatted}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-500', colorClass)}
            style={{ width: `${Math.min(100, account.usedPct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{account.fileCount} file</span>
          <span>{account.freeBytesFormatted} tersedia</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Delete Confirm ─────────────────────────────────── */

function DeleteConfirm({ account, onClose, onConfirm }: { account: Account | null; onClose: () => void; onConfirm: () => void }) {
  const isGoogle = account?.provider === 'google';
  return (
    <AlertDialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus akun ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Menghapus <strong>{account?.displayName}</strong> ({account?.email}) dari AnsCloud.{' '}
            {isGoogle
              ? 'File yang diupload lewat AnsCloud tidak dihapus dari Google Drive. Metadata saja yang dihapus.'
              : `Semua ${account?.fileCount ?? 0} file di akun ini akan dihapus dari server.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-rose-600 hover:bg-rose-700">Hapus</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}