'use client';

import {
  HardDrive,
  FolderTree,
  Cloud,
  Settings,
  LogOut,
  ArrowLeftRight,
  Star,
  Trash2,
  Clock,
  Sun,
  Moon,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { AnsCloudLogo } from './anscloud-logo';
import { cn } from '@/lib/utils';

export type ViewKey = 'files' | 'recent' | 'starred' | 'trash' | 'storage' | 'accounts' | 'migrate' | 'activity';

interface SidebarProps {
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  aggregate?: {
    usedPct: number;
    usedBytesFormatted: string;
    totalBytesFormatted: string;
    accountCount: number;
  };
}

export function Sidebar({ view, onViewChange, aggregate }: SidebarProps) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Note: this effect sets `mounted` to true after hydration to avoid
  // hydration mismatch on theme-dependent UI. Acceptable pattern.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setMounted(true), []);

  return (
    <aside className="flex h-full w-60 flex-col border-r apple-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5">
        <AnsCloudLogo className="h-9 w-9 shrink-0" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">AnsCloud</span>
          <span className="text-[11px] text-muted-foreground leading-tight">Multi-Cloud Storage</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        <SectionLabel>Browse</SectionLabel>
        <NavButton
          icon={FolderTree}
          label="File Saya"
          active={view === 'files'}
          onClick={() => onViewChange('files')}
        />
        <NavButton
          icon={Clock}
          label="Recent"
          active={view === 'recent'}
          onClick={() => onViewChange('recent')}
        />
        <NavButton
          icon={Star}
          label="Starred"
          active={view === 'starred'}
          onClick={() => onViewChange('starred')}
        />
        <NavButton
          icon={Trash2}
          label="Trash"
          active={view === 'trash'}
          onClick={() => onViewChange('trash')}
        />

        <SectionLabel>Manage</SectionLabel>
        <NavButton
          icon={Cloud}
          label="Ringkasan Storage"
          active={view === 'storage'}
          onClick={() => onViewChange('storage')}
        />
        <NavButton
          icon={Settings}
          label="Akun Google"
          active={view === 'accounts'}
          onClick={() => onViewChange('accounts')}
        />
        <NavButton
          icon={ArrowLeftRight}
          label="Migrate GDrive"
          active={view === 'migrate'}
          onClick={() => onViewChange('migrate')}
        />
        <NavButton
          icon={Activity}
          label="Activity Log"
          active={view === 'activity'}
          onClick={() => onViewChange('activity')}
        />
      </nav>

      {/* Storage indicator */}
      {aggregate && (
        <div className="border-t px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            <span>Storage Gabungan</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                aggregate.usedPct > 85
                  ? 'bg-rose-500'
                  : aggregate.usedPct > 65
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              )}
              style={{ width: `${Math.min(100, aggregate.usedPct)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {aggregate.usedBytesFormatted} dari {aggregate.totalBytesFormatted}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {aggregate.accountCount} akun terhubung
          </div>
        </div>
      )}

      {/* User, Theme & Logout */}
      <div className="border-t px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          {session?.user?.email && (
            <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={session.user.email}>
              {session.user.email}
            </div>
          )}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
          >
            {mounted && theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
          )}
        >
          <LogOut className="h-4 w-4" />
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
