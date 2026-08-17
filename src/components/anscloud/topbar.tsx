'use client';

import { Search, Upload, FolderPlus, RefreshCw, Zap, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { UploadMode } from './upload-dialog';

interface TopbarProps {
  title: string;
  search: string;
  onSearchChange: (v: string) => void;
  onUploadClick: () => void;
  onNewFolderClick: () => void;
  onRefresh: () => void;
  showFileActions?: boolean;
  uploadMode?: UploadMode;
}

export function Topbar({
  title,
  search,
  onSearchChange,
  onUploadClick,
  onNewFolderClick,
  onRefresh,
  showFileActions = true,
  uploadMode,
}: TopbarProps) {
  return (
    <header className="flex flex-col gap-3 border-b bg-background/80 px-6 py-4 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        {showFileActions && uploadMode && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              uploadMode === 'auto'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
            )}
            title={
              uploadMode === 'auto'
                ? 'Upload otomatis ke drive dengan ruang kosong terbanyak'
                : 'Upload manual — Anda pilih drive tujuan'
            }
          >
            {uploadMode === 'auto' ? (
              <>
                <Zap className="h-3 w-3" />
                Auto
              </>
            ) : (
              <>
                <Hand className="h-3 w-3" />
                Manual
              </>
            )}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          className="h-8 w-8"
          title="Segarkan"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {showFileActions && (
        <div className="flex flex-1 items-center gap-2 md:max-w-md md:justify-end">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari file…"
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onNewFolderClick}>
            <FolderPlus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Folder</span>
          </Button>
          <Button size="sm" onClick={onUploadClick} className="bg-emerald-600 hover:bg-emerald-700">
            <Upload className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      )}
    </header>
  );
}
