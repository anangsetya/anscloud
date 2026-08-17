'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Mail,
  HardDrive,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Cloud,
  Database,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  provider: string; // 'local' | 'google'
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

const COLOR_OPTIONS = [
  '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316',
];

export function AccountsManager({ accounts, loading, onChanged }: AccountsManagerProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);

  const { toast } = useToast();

  // Check OAuth config status on mount.
  useEffect(() => {
    fetch('/api/accounts/oauth-status')
      .then((r) => r.json())
      .then((d) => setOauthConfigured(!!d.configured))
      .catch(() => setOauthConfigured(false));
  }, []);

  const handleConnectGoogle = useCallback(() => {
    // Redirect to Google OAuth login. After consent, the callback will
    // redirect back to /?view=accounts with a success/error toast.
    window.location.href = '/api/auth/google/login?returnTo=/?view=accounts';
  }, []);

  const handleRefreshQuota = useCallback(
    async (accountId: string) => {
      setRefreshingId(accountId);
      try {
        const res = await fetch(`/api/accounts/refresh-quota?id=${accountId}`, {
          method: 'POST',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? 'Gagal memeriksa kuota');
        }
        const data = await res.json();
        toast({
          title: 'Kuota diperbarui',
          description: `Total: ${data.totalBytesFormatted} · Terpakai: ${data.usedBytesFormatted}`,
        });
        onChanged();
      } catch (e) {
        toast({
          title: 'Gagal',
          description: e instanceof Error ? e.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setRefreshingId(null);
      }
    },
    [onChanged, toast]
  );

  async function handleSeedDemo() {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed-demo', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal menyiapkan data demo');
      }
      const data = await res.json();
      if (data.alreadySeeded) {
        toast({ title: 'Info', description: 'Data demo sudah pernah disiapkan.' });
      } else {
        toast({
          title: 'Berhasil',
          description: '3 akun demo + file contoh telah dibuat.',
        });
      }
      onChanged();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Akun Google Drive Terhubung</h2>
          <p className="text-sm text-muted-foreground">
            Setiap akun menambah kapasitas storage ke pool gabungan AnsCloud. Tidak ada batasan jumlah akun yang bisa Anda tambahkan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {accounts.length === 0 && (
            <Button variant="outline" onClick={handleSeedDemo} disabled={seeding}>
              {seeding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Muat Data Demo
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleConnectGoogle}
            disabled={oauthConfigured === false}
            title={
              oauthConfigured === false
                ? 'Google OAuth belum dikonfigurasi di server. Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET untuk mengaktifkan.'
                : 'Hubungkan akun Google Drive asli via OAuth (full-access scope)'
            }
          >
            <Cloud className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Hubungkan Google Asli</span>
            <span className="sm:hidden">Google</span>
          </Button>
          <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Tambah Akun Demo</span>
            <span className="sm:hidden">Demo</span>
          </Button>
        </div>
      </div>

      {/* OAuth not configured warning */}
      {oauthConfigured === false && (
        <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Google OAuth belum dikonfigurasi di server ini
              </p>
              <p className="text-amber-800 dark:text-amber-200">
                Tombol &quot;Hubungkan Google Asli&quot; dinonaktifkan. Untuk menghubungkan akun
                Google Drive asli, setel{' '}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">GOOGLE_CLIENT_ID</code>{' '}
                &amp;{' '}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">GOOGLE_CLIENT_SECRET</code>{' '}
                di environment variables. Lihat instruksi lengkap di kartu info di bawah. Untuk
                sekarang, Anda masih bisa pakai{' '}
                <strong>akun demo</strong> (file disimpan di server lokal).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Memuat akun…
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState onSeed={handleSeedDemo} seeding={seeding} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onDelete={() => setDeleteTarget(acc)}
              onRefreshQuota={handleRefreshQuota}
              refreshing={refreshingId === acc.id}
            />
          ))}
        </div>
      )}

      {/* Setup instructions for real Google OAuth */}
      <Card className="mt-6 border-dashed">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="text-sm">
              <p className="font-medium">Cara Mengaktifkan Google Drive Asli</p>
              <p className="mt-1 text-muted-foreground">
                AnsCloud mendukung 2 jenis akun: <strong>Demo</strong> (file di server lokal, tanpa
                setup) dan <strong>Google Asli</strong> (file di Drive asli Anda via OAuth). Untuk
                mengaktifkan Google Asli, ikuti langkah berikut.
              </p>
            </div>
          </div>

          <ol className="ml-7 list-decimal space-y-2 text-sm text-muted-foreground">
            <li>
              Buka{' '}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                Google Cloud Console
                <ExternalLink className="h-3 w-3" />
              </a>{' '}
              → buat atau pilih project.
            </li>
            <li>
              Menu <strong>APIs &amp; Services → Library</strong> → enable{' '}
              <strong>Google Drive API</strong>.
            </li>
            <li>
              Menu <strong>APIs &amp; Services → OAuth consent screen</strong> → pilih{' '}
              <strong>External</strong> → isi nama app &quot;AnsCloud&quot; → tambahkan scope{' '}
              <code className="rounded bg-muted px-1">https://www.googleapis.com/auth/drive</code>{' '}
              (full access) &amp;{' '}
              <code className="rounded bg-muted px-1">userinfo.email</code>.
            </li>
            <li>
              Menu <strong>APIs &amp; Services → Credentials</strong> → Create Credentials →{' '}
              <strong>OAuth 2.0 Client ID</strong> (Web application) → tambahkan Authorized
              Redirect URI:{' '}
              <code className="rounded bg-muted px-1">
                https://domain-anda.com/api/auth/google/callback
              </code>
              .
            </li>
            <li>
              Set environment variables di server AnsCloud:
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                <code>{`GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
ANSCLOUD_PUBLIC_URL=https://domain-anda.com`}</code>
              </pre>
            </li>
            <li>
              Restart AnsCloud → tombol &quot;Hubungkan Google Asli&quot; akan aktif → klik → login
              dengan akun Google mana pun → kuota Drive asli otomatis ter-fetch.
            </li>
          </ol>

          <div className="ml-7 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p>
              <strong>Scope full-access</strong> ({' '}
              <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-900">.../auth/drive</code>{' '}
              ) memungkinkan AnsCloud membaca, mengupload, mengunduh, dan menghapus{' '}
              <strong>semua file</strong> di Drive Anda — termasuk file yang sudah ada sebelumnya,
              bukan hanya file yang diupload lewat AnsCloud. Jangan gunakan scope ini kalau Anda
              tidak yakin. Untuk mencabut akses kapan saja, kunjungi{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                myaccount.google.com/permissions
                <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          setAddOpen(false);
          onChanged();
        }}
      />

      <DeleteConfirm
        account={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const res = await fetch(`/api/accounts?id=${deleteTarget.id}`, { method: 'DELETE' });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error ?? 'Gagal menghapus akun');
            }
            toast({
              title: 'Berhasil',
              description: `Akun "${deleteTarget.displayName}" dihapus. Semua file di akun ini juga ikut terhapus.`,
            });
            setDeleteTarget(null);
            onChanged();
          } catch (e) {
            toast({
              title: 'Gagal',
              description: e instanceof Error ? e.message : 'Unknown error',
              variant: 'destructive',
            });
          }
        }}
      />
    </div>
  );
}

function AccountCard({
  account,
  onDelete,
  onRefreshQuota,
  refreshing,
}: {
  account: Account;
  onDelete: () => void;
  onRefreshQuota: (id: string) => void;
  refreshing: boolean;
}) {
  const colorClass =
    account.usedPct > 85
      ? 'bg-rose-500'
      : account.usedPct > 65
        ? 'bg-amber-500'
        : 'bg-emerald-500';

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
            <div className="flex flex-wrap items-center gap-1.5">
              <CardTitle className="truncate text-base">{account.displayName}</CardTitle>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  isGoogle
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                )}
                title={
                  isGoogle
                    ? 'Akun Google Drive asli via OAuth — file disimpan di Drive Anda yang sebenarnya'
                    : 'Akun demo — file disimpan di server lokal AnsCloud'
                }
              >
                {isGoogle ? (
                  <>
                    <Cloud className="h-2.5 w-2.5" />
                    Google Asli
                  </>
                ) : (
                  <>
                    <Database className="h-2.5 w-2.5" />
                    Demo Lokal
                  </>
                )}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span className="truncate">{account.email}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {isGoogle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRefreshQuota(account.id)}
                disabled={refreshing}
                title="Cek ulang kuota dari Google Drive API"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Terpakai</span>
          <span className="font-medium">
            {account.usedBytesFormatted} / {account.totalBytesFormatted}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-500', colorClass)}
            style={{ width: `${Math.min(100, account.usedPct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{account.fileCount} file</span>
          <span>{account.freeBytesFormatted} bebas</span>
        </div>
        {isGoogle && (
          <p className="text-[11px] text-muted-foreground">
            Kuota total diambil dari Google Drive API (Drive + Gmail + Photos). Klik ikon refresh
            untuk update real-time.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  onSeed,
  seeding,
}: {
  onSeed: () => void;
  seeding: boolean;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <HardDrive className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Belum ada akun Google Drive terhubung</p>
          <p className="text-sm text-muted-foreground">
            Tambahkan akun pertama Anda, atau muat data demo untuk mencoba langsung.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSeed} disabled={seeding}>
            {seeding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Muat 3 Akun Demo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddAccountDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [quotaGB, setQuotaGB] = useState('15');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  async function handleSubmit() {
    if (!email.trim() || !displayName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          totalBytesGB: Number(quotaGB) || 15,
          avatarColor: color,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal menambahkan akun');
      }
      toast({
        title: 'Berhasil',
        description: `Akun "${displayName}" berhasil ditambahkan ke pool.`,
      });
      setEmail('');
      setDisplayName('');
      setQuotaGB('15');
      setColor(COLOR_OPTIONS[0]);
      onAdded();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Akun Demo</DialogTitle>
          <DialogDescription>
            Buat akun demo dengan kuota simulasi. File akan disimpan di server lokal AnsCloud. Untuk
            menghubungkan akun <strong>Google Drive asli</strong> (file disimpan di Drive Anda
            sungguhan), gunakan tombol &quot;Hubungkan Google Asli&quot; di luar dialog ini.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="acc-name">Nama Tampilan</Label>
            <Input
              id="acc-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Contoh: Akun Pribadi"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-email">Email Google</Label>
            <Input
              id="acc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@gmail.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-quota">Kuota (GB)</Label>
            <Input
              id="acc-quota"
              type="number"
              min="0.1"
              max="30000"
              step="0.1"
              value={quotaGB}
              onChange={(e) => setQuotaGB(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Google Drive free tier = 15 GB. Workspace = 30 TB. Sesuaikan dengan kuota akun Anda.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Warna Identitas</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !email.trim() || !displayName.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? 'Menambahkan…' : 'Tambah Akun'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({
  account,
  onClose,
  onConfirm,
}: {
  account: Account | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isGoogle = account?.provider === 'google';
  return (
    <AlertDialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Putuskan akun ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Anda akan menghapus <strong>{account?.displayName}</strong> ({account?.email})
            dari AnsCloud. {isGoogle ? (
              <>
                Karena ini akun <strong>Google Asli</strong>, file yang sudah Anda upload lewat
                AnsCloud <strong>tidak akan dihapus</strong> dari Google Drive Anda — mereka tetap
                ada di Drive dan bisa Anda akses langsung via drive.google.com. Hanya metadata
                AnsCloud yang dihapus. Untuk mencabut akses OAuth sepenuhnya, kunjungi{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  myaccount.google.com/permissions
                </a>
                .
              </>
            ) : (
              <>
                <strong>Semua {account?.fileCount ?? 0} file</strong> yang tersimpan di akun demo
                ini juga akan dihapus dari server lokal. Tindakan ini tidak dapat dibatalkan.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
          >
            Ya, Hapus Akun
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
