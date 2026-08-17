'use client';

import { HardDrive, TrendingUp, Files, Cloud } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface StorageOverviewProps {
  data: {
    aggregate: {
      totalBytes: string;
      usedBytes: string;
      freeBytes: string;
      usedPct: number;
      accountCount: number;
      totalBytesFormatted: string;
      usedBytesFormatted: string;
      freeBytesFormatted: string;
    };
    accounts: Array<{
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
    }>;
    typeBreakdown?: Array<{
      name: string;
      count: number;
      totalBytes: string;
      totalBytesFormatted: string;
      color: string;
    }>;
  } | null;
  loading: boolean;
}

export function StorageOverview({ data, loading }: StorageOverviewProps) {
  if (loading || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Memuat ringkasan storage…
      </div>
    );
  }

  const { aggregate, accounts, typeBreakdown } = data;
  const hasFiles = typeBreakdown && typeBreakdown.length > 0;
  const totalBytesNum = Number(aggregate.totalBytes) || 1;
  const freePct = 100 - aggregate.usedPct;
  // Build pie data: typeBreakdown + "Free" segment to show full disk usage
  const pieData = [
    ...(typeBreakdown ?? []).map((t) => ({
      name: t.name,
      value: Number(t.totalBytes),
      color: t.color,
      formatted: t.totalBytesFormatted,
      count: t.count,
    })),
    {
      name: 'Free',
      value: Number(aggregate.freeBytes),
      color: '#e5e7eb',
      formatted: aggregate.freeBytesFormatted,
      count: 0,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Aggregate summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={<Cloud className="h-5 w-5" />}
          label="Total Kapasitas"
          value={aggregate.totalBytesFormatted}
          subtitle={`${aggregate.accountCount} akun tergabung`}
          color="from-blue-500 to-indigo-600"
        />
        <StatCard
          icon={<HardDrive className="h-5 w-5" />}
          label="Terpakai"
          value={aggregate.usedBytesFormatted}
          subtitle={`${aggregate.usedPct}% dari total`}
          color="from-amber-500 to-orange-600"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Tersedia"
          value={aggregate.freeBytesFormatted}
          subtitle={`${freePct}% ruang kosong`}
          color="from-violet-500 to-purple-600"
        />
      </div>

      {/* Big aggregate bar */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Penggunaan Storage Gabungan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted">
            {accounts.map((a) => {
              const sharePct = (Number(a.usedBytes) / totalBytesNum) * 100;
              if (sharePct <= 0) return null;
              return (
                <div
                  key={a.id}
                  className="h-full transition-all hover:opacity-80"
                  style={{ width: `${sharePct}%`, backgroundColor: a.avatarColor }}
                  title={`${a.displayName} (${a.email}): ${a.usedBytesFormatted}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>0 B</span>
            <span>{aggregate.totalBytesFormatted}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: a.avatarColor }} />
                <span className="font-medium">{a.displayName}</span>
                <span className="text-muted-foreground">· {a.usedBytesFormatted}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Type breakdown pie chart */}
      {hasFiles && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Breakdown per Jenis Dokumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={45}
                      paddingAngle={2}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name, props) => {
                        const p = props.payload as { formatted?: string; count?: number; name: string };
                        return [`${p.formatted ?? value} (${p.count ?? 0} file)`, p.name];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {typeBreakdown!.map((t) => {
                  const pct = (Number(t.totalBytes) / totalBytesNum) * 100;
                  return (
                    <div key={t.name} className="flex items-center gap-3 text-sm">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="flex-1 truncate font-medium">{t.name}</span>
                      <span className="text-muted-foreground">{t.count} file</span>
                      <span className="w-20 text-right font-medium">{t.totalBytesFormatted}</span>
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-account breakdown */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">Detail per Akun</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <AccountCard key={a.id} account={a} />
        ))}
      </div>

      {accounts.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Files className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Belum ada akun Google Drive terhubung</p>
            <p className="text-sm text-muted-foreground">
              Buka tab &quot;Akun Google&quot; untuk menambahkan akun pertama Anda.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm',
            color
          )}
        >
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-2xl font-bold leading-tight">{value}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountCard({
  account,
}: {
  account: {
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
  };
}) {
  const usedPct = account.usedPct;
  const colorClass =
    usedPct > 85 ? 'bg-rose-500' : usedPct > 65 ? 'bg-amber-500' : 'bg-primary';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: account.avatarColor }}
          >
            {account.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{account.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{account.email}</div>
          </div>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              account.provider === 'google'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            {account.provider === 'google' ? 'Google' : 'Demo'}
          </span>
        </div>

        <div className="mb-1.5 flex justify-between text-xs">
          <span className="font-medium">{account.usedBytesFormatted}</span>
          <span className="text-muted-foreground">dari {account.totalBytesFormatted}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-500', colorClass)}
            style={{ width: `${Math.min(100, usedPct)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{account.fileCount} file</span>
          <span>{account.freeBytesFormatted} bebas</span>
        </div>
      </CardContent>
    </Card>
  );
}
