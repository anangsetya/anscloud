'use client';

import { Search, Upload, FolderPlus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TopbarProps {
  title: string;
  search: string;
  onSearchChange: (v: string) => void;
  onUploadClick: () => void;
  onNewFolderClick: () => void;
  onRefresh: () => void;
  showFileActions?: boolean;
}

export function Topbar({
  title,
  search,
  onSearchChange,
  onUploadClick,
  onNewFolderClick,
  onRefresh,
  showFileActions = true,
}: TopbarProps) {
  return (
    <header className="flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        <Button variant="ghost" size="icon" onClick={onRefresh} className="h-8 w-8" title="Segarkan">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {showFileActions && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari file…"
              className="w-64 pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onNewFolderClick}>
            <FolderPlus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Folder</span>
          </Button>
          <Button size="sm" onClick={onUploadClick}>
            <Upload className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      )}
    </header>
  );
}
