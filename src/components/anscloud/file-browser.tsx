'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  Download,
  Trash2,
  Pencil,
  MoreVertical,
  Home,
  LayoutGrid,
  List as ListIcon,
  Star,
  RotateCcw,
  CheckSquare,
  Square,
  X,
  Clock,
  Share2,
  History,
  FileArchive,
  Loader2,
  ArrowUpDown,
  FolderSync,
  ArrowRightLeft,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { FileIcon, FolderIcon } from './file-icon';
import { FilePreviewDialog } from './file-preview-dialog';
import { ShareDialog } from './share-dialog';
import { VersionHistoryDialog } from './version-history-dialog';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/file-utils';

// ─── Types ────────────────────────────────────────────────────────

interface FolderItem {
  id: string;
  name: string;
  type: 'folder';
  createdAt: string;
  drivePath?: string;
}

interface DriveFolderItem {
  name: string;
  path: string;
  count: number;
}

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  sizeFormatted?: string;
  createdAt: string;
  createdAtFormatted?: string;
  updatedAt?: string;
  driveAccountId: string;
  driveAccountEmail: string;
  driveAccountColor: string;
  icon: { icon: string; color: string };
  isStarred?: boolean;
  deletedAt?: string;
  folderName?: string | null;
  drivePath?: string | null;
  type: 'file';
}

type Item = FolderItem | FileItem;

type SortField = 'name' | 'size' | 'modified' | 'type' | 'location';
type SortDir = 'asc' | 'desc';

interface FileBrowserProps {
  refreshKey: number;
  search: string;
  onRefresh: () => void;
  currentFolderId: string | null;
  onFolderChange: (id: string | null) => void;
  filter?: 'recent' | 'starred' | 'trash' | null;
}

// ─── Component ────────────────────────────────────────────────────

export function FileBrowser({
  refreshKey,
  search,
  onRefresh,
  currentFolderId,
  onFolderChange,
  filter = null,
}: FileBrowserProps) {
  const [breadcrumb, setBreadcrumb] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'My AnsCloud' },
  ]);
  const [items, setItems] = useState<Item[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [renameTarget, setRenameTarget] = useState<Item | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [versionTarget, setVersionTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Drive folder navigation
  const [currentDrivePath, setCurrentDrivePath] = useState<string | null>(null);
  const [drivePathBreadcrumb, setDrivePathBreadcrumb] = useState<string[]>([]);

  // Move dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetAccount, setMoveTargetAccount] = useState('');
  const [moveDrivePath, setMoveDrivePath] = useState('');
  const [moveAutoGroup, setMoveAutoGroup] = useState(false);
  const [moveAccounts, setMoveAccounts] = useState<Array<{ id: string; email: string; provider: string }>>([]);
  const [moveDriveFolders, setMoveDriveFolders] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);

  // Navigation history for back button
  const [navHistory, setNavHistory] = useState<Array<{ folderId: string | null; drivePath: string | null }>>([]);

  const { toast } = useToast();

  // ─── Load files ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      let url: string;
      if (search.trim()) {
        url = `/api/files?search=${encodeURIComponent(search.trim())}&sort=${sortBy}:${sortDir}`;
      } else if (filter) {
        url = `/api/files?filter=${filter}&sort=${sortBy}:${sortDir}`;
      } else if (currentDrivePath) {
        url = `/api/files?drivePath=${encodeURIComponent(currentDrivePath)}&sort=${sortBy}:${sortDir}`;
      } else {
        url = `/api/files?folderId=${currentFolderId ?? ''}&sort=${sortBy}:${sortDir}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal memuat data');
      const data = await res.json();

      if (search.trim() || filter) {
        if (filter === 'trash') {
          setBreadcrumb([{ id: null, name: 'Trash' }]);
        } else if (filter === 'starred') {
          setBreadcrumb([{ id: null, name: 'Starred Files' }]);
        } else if (filter === 'recent') {
          setBreadcrumb([{ id: null, name: 'Recent Files' }]);
        } else {
          setBreadcrumb([{ id: null, name: `Hasil pencarian: "${search.trim()}"` }]);
        }
        setItems(data.files ?? []);
        setDriveFolders([]);
      } else if (currentDrivePath) {
        // Drive path navigation
        const segments = currentDrivePath.split('/');
        setDrivePathBreadcrumb(segments);
        setBreadcrumb([
          { id: null, name: 'My AnsCloud' },
          ...segments.map((s, i) => ({ id: `drive:${segments.slice(0, i + 1).join('/')}`, name: s })),
        ]);
        const folders: FolderItem[] = (data.folders ?? []).map((f: FolderItem) => ({ ...f }));
        const files: FileItem[] = (data.files ?? []).map((f: FileItem) => ({ ...f }));
        setItems([...folders, ...files]);
        setDriveFolders([]);
      } else {
        setBreadcrumb(data.breadcrumb ?? [{ id: null, name: 'My AnsCloud' }]);
        const folders: FolderItem[] = (data.folders ?? []).map((f: FolderItem) => ({ ...f }));
        const files: FileItem[] = (data.files ?? []).map((f: FileItem) => ({ ...f }));
        setItems([...folders, ...files]);
        setDriveFolders(data.driveFolders ?? []);
      }
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Gagal memuat file',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, search, filter, sortBy, sortDir, currentDrivePath, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Reset drive path when folder changes
  useEffect(() => {
    setCurrentDrivePath(null);
    setDrivePathBreadcrumb([]);
  }, [currentFolderId]);

  // ─── Handlers ────────────────────────────────────────────────

  function handleOpenFolder(folderId: string | null) {
    // Check if it's a Drive folder (id starts with "drive:")
    if (folderId && folderId.startsWith('drive:')) {
      const path = folderId.slice(6);
      // Push current state to history
      setNavHistory((h) => [...h, { folderId: currentFolderId, drivePath: currentDrivePath }]);
      setCurrentDrivePath(path);
      return;
    }
    // Push current state to history
    setNavHistory((h) => [...h, { folderId: currentFolderId, drivePath: currentDrivePath }]);
    onFolderChange(folderId);
  }

  function handleGoBack() {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory((h) => h.slice(0, -1));
    setCurrentDrivePath(prev.drivePath);
    if (prev.folderId !== currentFolderId) {
      onFolderChange(prev.folderId);
    }
  }

  function handleNavigateDrivePath(path: string | null) {
    setCurrentDrivePath(path);
  }

  function handleDownload(file: FileItem) {
    window.open(`/api/download?id=${encodeURIComponent(file.id)}`, '_blank');
  }

  function handlePreview(file: FileItem) {
    setPreviewFile(file);
  }

  async function handleToggleStar(file: FileItem) {
    try {
      const res = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id, isStarred: !file.isStarred }),
      });
      if (!res.ok) throw new Error('Gagal toggle star');
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function handleDelete(item: Item, permanent = false) {
    const msg = filter === 'trash' || permanent
      ? `Hapus permanen "${item.name}"? File tidak bisa dikembalikan.`
      : `Pindahkan "${item.name}" ke trash? Bisa dipulihkan nanti.`;
    if (!confirm(msg)) return;
    try {
      const url = `/api/files?id=${encodeURIComponent(item.id)}${permanent ? '&permanent=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal menghapus');
      }
      toast({
        title: 'Berhasil',
        description: filter === 'trash' || permanent
          ? `"${item.name}" dihapus permanen.`
          : `"${item.name}" dipindahkan ke trash.`,
      });
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal menghapus',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function handleRestore(file: FileItem) {
    try {
      const res = await fetch('/api/files/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal restore');
      }
      toast({ title: 'Berhasil', description: `"${file.name}" dipulihkan dari trash.` });
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function handleBulkAction(action: 'delete' | 'permanent_delete' | 'restore' | 'star' | 'unstar' | 'zip') {
    if (selectedIds.size === 0) return;
    if (action === 'zip') {
      await handleDownloadZip();
      return;
    }
    const msgMap: Record<string, string> = {
      delete: `Pindahkan ${selectedIds.size} file ke trash?`,
      permanent_delete: `Hapus permanen ${selectedIds.size} file? Tidak bisa dikembalikan.`,
      restore: `Pulihkan ${selectedIds.size} file dari trash?`,
      star: `Tandai ${selectedIds.size} file sebagai starred?`,
      unstar: `Hapus starred dari ${selectedIds.size} file?`,
    };
    if (!confirm(msgMap[action])) return;
    try {
      const res = await fetch('/api/files/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal bulk action');
      }
      const data = await res.json();
      toast({
        title: 'Berhasil',
        description: `${data.processed} file diproses, ${data.failed} gagal.`,
      });
      setBulkMode(false);
      setSelectedIds(new Set());
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function handleDownloadZip() {
    if (selectedIds.size === 0) return;
    setZipping(true);
    try {
      const res = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          folderName: 'anscloud-files',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal membuat ZIP');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'anscloud-files.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: 'ZIP diunduh',
        description: `${selectedIds.size} file dipaket sebagai ZIP.`,
      });
    } catch (e) {
      toast({
        title: 'Gagal membuat ZIP',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setZipping(false);
    }
  }

  async function handleMoveFile(fileId: string, targetFolderId: string | null) {
    try {
      const res = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fileId, folderId: targetFolderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal memindahkan file');
      }
      toast({ title: 'Berhasil', description: 'File dipindahkan.' });
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal memindahkan',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  // ─── Move to Drive dialog ────────────────────────────────────

  async function openMoveDialog() {
    if (selectedIds.size === 0) return;
    // Fetch accounts
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Gagal memuat akun');
      const data = await res.json();
      setMoveAccounts(data.accounts ?? []);

      // Fetch unique drive paths for folder selection
      const filesRes = await fetch('/api/files?folderId=&sort=name:asc');
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        const paths = new Set<string>();
        for (const f of filesData.files ?? []) {
          if (f.drivePath) paths.add(f.drivePath.split('/')[0]);
        }
        setMoveDriveFolders(Array.from(paths).sort());
      }

      setMoveDialogOpen(true);
      setMoveTargetAccount('');
      setMoveDrivePath('');
      setMoveAutoGroup(false);
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Gagal memuat data akun',
        variant: 'destructive',
      });
    }
  }

  async function executeMoveToDrive() {
    if (!moveTargetAccount || selectedIds.size === 0) return;
    setMoving(true);
    try {
      const res = await fetch('/api/files/move-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: Array.from(selectedIds),
          targetAccountId: moveTargetAccount,
          targetDrivePath: moveAutoGroup ? undefined : (moveDrivePath || undefined),
          autoGroup: moveAutoGroup,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal memindahkan');
      }
      const data = await res.json();
      toast({
        title: 'Berhasil dipindahkan',
        description: data.message,
      });
      setMoveDialogOpen(false);
      setBulkMode(false);
      setSelectedIds(new Set());
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal memindahkan',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setMoving(false);
    }
  }

  // ─── Sort helpers ────────────────────────────────────────────

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  }

  const sortLabel = useMemo(() => {
    const labels: Record<SortField, string> = {
      name: 'Nama',
      size: 'Ukuran',
      modified: 'Terakhir Ubah',
      type: 'Jenis File',
      location: 'Lokasi',
    };
    return `${labels[sortBy]} ${sortDir === 'asc' ? '↑' : '↓'}`;
  }, [sortBy, sortDir]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startRename(item: Item) {
    setRenameTarget(item);
    setRenameValue(item.name);
  }

  async function confirmRename() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      const url = renameTarget.type === 'file' ? '/api/files' : '/api/folders';
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renameTarget.id, name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal mengganti nama');
      }
      toast({ title: 'Berhasil', description: 'Nama diperbarui.' });
      setRenameTarget(null);
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  // Update previewFile object when items refresh
  useEffect(() => {
    if (previewFile) {
      const updated = items.find((i) => i.id === previewFile.id && i.type === 'file') as FileItem | undefined;
      if (updated && updated.isStarred !== previewFile.isStarred) {
        setPreviewFile(updated);
      }
    }
  }, [items, previewFile]);

  const isTrash = filter === 'trash';
  const isSpecial = filter !== null || !!search.trim() || !!currentDrivePath;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Breadcrumb, sort, and view controls */}
      <div className="flex flex-wrap items-center gap-1 border-b px-4 py-3 text-sm">
        {/* Back button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleGoBack}
          disabled={navHistory.length === 0}
          title="Kembali"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button
          onClick={() => {
            if (currentDrivePath) {
              // Go back to root drive view
              setNavHistory([]);
              setCurrentDrivePath(null);
              setDrivePathBreadcrumb([]);
            } else {
              setNavHistory([]);
              onFolderChange(null);
            }
          }}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          <span>Root</span>
        </button>
        {breadcrumb.slice(1).map((b, idx) => (
          <div key={`${b.id ?? 'root'}-${idx}`} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => {
                if (b.id && b.id.startsWith('drive:')) {
                  const path = b.id.slice(6);
                  // Navigate to this drive path level
                  const segments = path.split('/');
                  setCurrentDrivePath(segments.join('/'));
                } else {
                  onFolderChange(b.id);
                }
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {b.name}
            </button>
          </div>
        ))}
        {breadcrumb.length === 1 && !currentDrivePath && (
          <span className="ml-1 font-medium">{breadcrumb[0].name}</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Sort controls */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toggleSort('name')}>
                Nama {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('size')}>
                Ukuran {sortBy === 'size' && (sortDir === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('modified')}>
                Terakhir Ubah {sortBy === 'modified' && (sortDir === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('type')}>
                Jenis File {sortBy === 'type' && (sortDir === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('location')}>
                Lokasi (Drive) {sortBy === 'location' && (sortDir === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!isSpecial && (
            <>
              <Button
                variant={bulkMode ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setBulkMode(!bulkMode);
                  setSelectedIds(new Set());
                }}
                title={bulkMode ? 'Keluar mode pilih' : 'Mode pilih banyak'}
              >
                {bulkMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              </Button>
            </>
          )}
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
            title="Tampilan list"
          >
            <ListIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
            title="Tampilan grid"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Drive folder chips (only at root, no AnsCloud folder selected) */}
      {!isSpecial && !currentFolderId && driveFolders.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b px-6 py-3 bg-muted/20">
          <FolderSync className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground self-center mr-1">Folder Drive:</span>
          {driveFolders.map((df) => (
            <button
              key={df.path}
              onClick={() => handleNavigateDrivePath(df.path)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                currentDrivePath === df.path
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-border bg-background hover:bg-muted'
              )}
            >
              <FolderIcon className="h-3.5 w-3.5" />
              {df.name}
              <span className="text-[10px] text-muted-foreground">({df.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Bulk action toolbar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50 px-6 py-2 dark:bg-emerald-950/30">
          <span className="text-sm font-medium">{selectedIds.size} file dipilih</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {!isTrash && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('star')}>
                  <Star className="mr-1 h-3.5 w-3.5" />
                  Star
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('zip')}
                  disabled={zipping}
                >
                  {zipping ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileArchive className="mr-1 h-3.5 w-3.5" />
                  )}
                  {zipping ? 'Menyiapkan...' : 'Download ZIP'}
                </Button>
                <Button size="sm" variant="outline" onClick={openMoveDialog}>
                  <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                  Pindah ke Drive
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('delete')}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  ke Trash
                </Button>
              </>
            )}
            {isTrash && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('restore')}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Restore
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleBulkAction('permanent_delete')}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Hapus Permanen
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Memuat...
          </div>
        ) : items.length === 0 && driveFolders.length === 0 ? (
          <EmptyState filter={filter} search={search} />
        ) : viewMode === 'list' ? (
          <ListView
            items={items}
            onOpenFolder={handleOpenFolder}
            onDownload={handleDownload}
            onPreview={handlePreview}
            onDelete={handleDelete}
            onRename={startRename}
            onToggleStar={handleToggleStar}
            onRestore={handleRestore}
            onShare={(f) => setShareTarget({ id: f.id, name: f.name })}
            onVersion={(f) => setVersionTarget({ id: f.id, name: f.name })}
            onMoveFile={handleMoveFile}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            isTrash={isTrash}
            dragOverFolderId={dragOverFolderId}
            onDragOverFolder={setDragOverFolderId}
            onDragStartFile={setDraggingFileId}
            draggingFileId={draggingFileId}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        ) : (
          <GridView
            items={items}
            onOpenFolder={handleOpenFolder}
            onDownload={handleDownload}
            onPreview={handlePreview}
            onDelete={handleDelete}
            onRename={startRename}
            onToggleStar={handleToggleStar}
            onRestore={handleRestore}
            onShare={(f) => setShareTarget({ id: f.id, name: f.name })}
            onVersion={(f) => setVersionTarget({ id: f.id, name: f.name })}
            onMoveFile={handleMoveFile}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            isTrash={isTrash}
            dragOverFolderId={dragOverFolderId}
            onDragOverFolder={setDragOverFolderId}
            onDragStartFile={setDraggingFileId}
            draggingFileId={draggingFileId}
          />
        )}
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti nama</DialogTitle>
            <DialogDescription>
              {renameTarget?.type === 'folder' ? 'Folder' : 'File'} baru:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">Nama</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Batal</Button>
            <Button onClick={confirmRename}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Drive dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pindah ke Drive Lain</DialogTitle>
            <DialogDescription>
              Pindahkan {selectedIds.size} file ke akun Drive lain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Target account */}
            <div className="space-y-2">
              <Label>Akun Tujuan</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={moveTargetAccount}
                onChange={(e) => setMoveTargetAccount(e.target.value)}
              >
                <option value="">-- Pilih akun Drive --</option>
                {moveAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.email} {acc.provider === 'google' ? '(Google Drive)' : '(Local)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-group toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-group"
                checked={moveAutoGroup}
                onChange={(e) => setMoveAutoGroup(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="auto-group" className="cursor-pointer">
                Otomatis kelompokkan berdasarkan jenis (Gambar, Video, Dokumen, dll)
              </Label>
            </div>

            {/* Manual folder selection (only if not auto-group) */}
            {!moveAutoGroup && (
              <div className="space-y-2">
                <Label>Folder Tujuan (opsional)</Label>
                <Input
                  placeholder="Contoh: Photos/2024"
                  value={moveDrivePath}
                  onChange={(e) => setMoveDrivePath(e.target.value)}
                />
                {moveDriveFolders.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">Tersedia:</span>
                    {moveDriveFolders.map((p) => (
                      <button
                        key={p}
                        onClick={() => setMoveDrivePath(p)}
                        className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Batal</Button>
            <Button
              onClick={executeMoveToDrive}
              disabled={!moveTargetAccount || moving}
            >
              {moving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memindahkan...
                </>
              ) : (
                'Pindahkan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <FilePreviewDialog
        file={previewFile}
        open={!!previewFile}
        onOpenChange={(o) => !o && setPreviewFile(null)}
        onDownload={handleDownload}
        onToggleStar={handleToggleStar}
      />

      {/* Share dialog */}
      <ShareDialog
        file={shareTarget}
        open={!!shareTarget}
        onOpenChange={(o) => !o && setShareTarget(null)}
      />

      {/* Version history dialog */}
      <VersionHistoryDialog
        file={versionTarget}
        open={!!versionTarget}
        onOpenChange={(o) => !o && setVersionTarget(null)}
        onRestored={onRefresh}
      />
    </div>
  );
}

// ─── List View ───────────────────────────────────────────────────

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sortBy === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center gap-1 text-left transition-colors hover:text-foreground',
        active ? 'text-foreground font-semibold' : 'text-muted-foreground',
        className
      )}
    >
      {label}
      {active && <ArrowUpDown className="h-3 w-3" />}
    </button>
  );
}

function ListView(props: {
  items: Item[];
  onOpenFolder: (id: string | null) => void;
  onDownload: (f: FileItem) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null;
  onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void;
  draggingFileId: string | null;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const { items, bulkMode, selectedIds, onToggleSelect, isTrash, sortBy, sortDir, onSort } = props;
  return (
    <Card className="overflow-hidden p-0">
      <div
        className="grid items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: bulkMode ? '32px 1fr 100px 140px 140px 140px 40px' : '1fr 100px 140px 140px 140px 40px' }}
      >
        {bulkMode && <span />}
        <SortableHeader label="Nama" field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortableHeader label="Ukuran" field="size" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortableHeader label="Jenis" field="type" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortableHeader label="Lokasi" field="location" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortableHeader label={isTrash ? 'Dihapus' : 'Terakhir Ubah'} field="modified" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <span />
      </div>
      <div className="divide-y">
        {items.map((item) => (
          <Row key={`${item.type}-${item.id}`} item={item} {...props} />
        ))}
      </div>
    </Card>
  );
}

// ─── Row ─────────────────────────────────────────────────────────

function Row({
  item,
  onOpenFolder,
  onDownload,
  onPreview,
  onDelete,
  onRename,
  onToggleStar,
  onRestore,
  onShare,
  onVersion,
  onMoveFile,
  bulkMode,
  selectedIds,
  onToggleSelect,
  isTrash,
  dragOverFolderId,
  onDragOverFolder,
  onDragStartFile,
  draggingFileId,
}: {
  item: Item;
  onOpenFolder: (id: string | null) => void;
  onDownload: (f: FileItem) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null;
  onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void;
  draggingFileId: string | null;
}) {
  const isFile = item.type === 'file';
  const selected = selectedIds.has(item.id);
  const isDropTarget = !isFile && dragOverFolderId === item.id;
  return (
    <div
      className={cn(
        'grid items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40',
        isFile && 'cursor-pointer',
        selected && 'bg-emerald-50 dark:bg-emerald-950/30',
        isDropTarget && 'ring-2 ring-emerald-500 ring-inset bg-emerald-50 dark:bg-emerald-950/30'
      )}
      style={{ gridTemplateColumns: bulkMode ? '32px 1fr 100px 140px 140px 140px 40px' : '1fr 100px 140px 140px 140px 40px' }}
      draggable={isFile && !bulkMode}
      onDragStart={(e) => {
        if (isFile) {
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStartFile(item.id);
        }
      }}
      onDragEnd={() => {
        onDragStartFile(null);
        onDragOverFolder(null);
      }}
      onDragOver={(e) => {
        if (!isFile && draggingFileId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOverFolder(item.id);
        }
      }}
      onDragLeave={() => {
        if (!isFile && dragOverFolderId === item.id) {
          onDragOverFolder(null);
        }
      }}
      onDrop={(e) => {
        if (!isFile && draggingFileId) {
          e.preventDefault();
          onMoveFile(draggingFileId, item.id);
          onDragStartFile(null);
          onDragOverFolder(null);
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isFile) {
          onToggleSelect(item.id);
        }
      }}
      onDoubleClick={() => {
        if (isFile) {
          onPreview(item);
        } else {
          onOpenFolder(item.id);
        }
      }}
    >
      {bulkMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
          className="flex h-5 w-5 items-center justify-center"
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-emerald-600" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      )}
      <div className="flex min-w-0 items-center gap-3">
        {item.type === 'folder' ? (
          <FolderIcon className="h-5 w-5 shrink-0" />
        ) : (
          <FileIcon icon={item.icon.icon} color={item.icon.color} className="h-5 w-5 shrink-0" />
        )}
        <div className="min-w-0">
          <span className="truncate font-medium block">{item.name}</span>
          {isFile && item.drivePath && (
            <span className="text-[10px] text-muted-foreground truncate block">
              {item.drivePath}
            </span>
          )}
        </div>
        {isFile && item.isStarred && (
          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
        )}
      </div>
      <span className="text-muted-foreground text-xs">
        {item.type === 'folder' ? '—' : item.sizeFormatted ?? formatBytesLocal(item.sizeBytes)}
      </span>
      <span className="text-muted-foreground text-xs truncate">
        {item.type === 'folder' ? '—' : getMimeLabel(item.mimeType)}
      </span>
      <span className="text-muted-foreground text-xs truncate">
        {item.type === 'folder' ? (
          '—'
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.driveAccountColor }} />
            <span className="truncate">{item.driveAccountEmail.split('@')[0]}</span>
          </span>
        )}
      </span>
      <span className="text-muted-foreground text-xs">
        {new Date(isTrash && isFile ? (item.deletedAt ?? item.createdAt) : item.updatedAt ?? item.createdAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </span>
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        {isFile && !bulkMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isTrash && (
                <>
                  <DropdownMenuItem onClick={() => onPreview(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDownload(item)}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleStar(item)}>
                    <Star className={cn('mr-2 h-4 w-4', item.isStarred && 'fill-amber-400 text-amber-400')} />
                    {item.isStarred ? 'Hapus star' : 'Star'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onShare(item)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Bagikan
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onVersion(item)}>
                    <History className="mr-2 h-4 w-4" />
                    Version History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRename(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Ganti nama
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(item)} className="text-rose-600 focus:text-rose-700">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Pindah ke Trash
                  </DropdownMenuItem>
                </>
              )}
              {isTrash && (
                <>
                  <DropdownMenuItem onClick={() => onRestore(item)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Pulihkan
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(item, true)}
                    className="text-rose-600 focus:text-rose-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Hapus Permanen
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {item.type === 'folder' && !bulkMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRename(item)}>
                <Pencil className="mr-2 h-4 w-4" />
                Ganti nama
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(item)} className="text-rose-600 focus:text-rose-700">
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ─── Grid View ───────────────────────────────────────────────────

function GridView(props: {
  items: Item[];
  onOpenFolder: (id: string | null) => void;
  onDownload: (f: FileItem) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null;
  onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void;
  draggingFileId: string | null;
}) {
  const { items, bulkMode, selectedIds, onToggleSelect } = props;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => {
        const selected = selectedIds.has(item.id);
        const isFile = item.type === 'file';
        const isDropTarget = !isFile && props.dragOverFolderId === item.id;
        return (
          <Card
            key={`${item.type}-${item.id}`}
            className={cn(
              'group relative flex cursor-pointer flex-col items-center gap-2 p-4 transition-all hover:shadow-md',
              selected && 'ring-2 ring-emerald-500',
              isDropTarget && 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
            )}
            draggable={isFile && !bulkMode}
            onDragStart={(e) => {
              if (isFile) {
                e.dataTransfer.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
                props.onDragStartFile(item.id);
              }
            }}
            onDragEnd={() => {
              props.onDragStartFile(null);
              props.onDragOverFolder(null);
            }}
            onDragOver={(e) => {
              if (!isFile && props.draggingFileId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                props.onDragOverFolder(item.id);
              }
            }}
            onDragLeave={() => {
              if (!isFile && props.dragOverFolderId === item.id) {
                props.onDragOverFolder(null);
              }
            }}
            onDrop={(e) => {
              if (!isFile && props.draggingFileId) {
                e.preventDefault();
                props.onMoveFile(props.draggingFileId, item.id);
                props.onDragStartFile(null);
                props.onDragOverFolder(null);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isFile) onToggleSelect(item.id);
            }}
            onDoubleClick={() => {
              if (isFile) props.onPreview(item);
              else props.onOpenFolder(item.id);
            }}
          >
            {bulkMode && (
              <div className="absolute left-1.5 top-1.5">
                {selected ? (
                  <CheckSquare className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Square className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            )}
            <div className="flex h-16 w-16 items-center justify-center">
              {item.type === 'folder' ? (
                <FolderIcon className="h-12 w-12" />
              ) : (
                <FileIcon icon={item.icon.icon} color={item.icon.color} className="h-12 w-12" />
              )}
            </div>
            <div className="w-full text-center">
              <div className="truncate text-sm font-medium" title={item.name}>
                {item.name}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {item.type === 'folder' ? 'Folder' : item.sizeFormatted ?? formatBytesLocal(item.sizeBytes)}
              </div>
              {isFile && (
                <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.driveAccountColor }} />
                  <span className="truncate">{item.driveAccountEmail.split('@')[0]}</span>
                  {item.isStarred && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                </div>
              )}
            </div>
            <div
              className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!props.isTrash && isFile && (
                    <>
                      <DropdownMenuItem onClick={() => props.onDownload(item)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onToggleStar(item)}>
                        <Star className={cn('mr-2 h-4 w-4', item.isStarred && 'fill-amber-400 text-amber-400')} />
                        {item.isStarred ? 'Hapus star' : 'Star'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onShare(item)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Bagikan
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onVersion(item)}>
                        <History className="mr-2 h-4 w-4" />
                        Version History
                      </DropdownMenuItem>
                    </>
                  )}
                  {props.isTrash && isFile && (
                    <DropdownMenuItem onClick={() => props.onRestore(item)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Pulihkan
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => props.onRename(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Ganti nama
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => props.onDelete(item, props.isTrash)}
                    className="text-rose-600 focus:text-rose-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {props.isTrash ? 'Hapus Permanen' : 'Pindah ke Trash'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────

function EmptyState({ filter, search }: { filter: string | null; search: string }) {
  let title = 'Folder kosong';
  let desc = 'Upload file pertama Anda, atau buat folder baru untuk mulai mengatur.';
  if (search.trim()) {
    title = 'Tidak ada hasil';
    desc = `Tidak ada file yang cocok dengan "${search.trim()}".`;
  } else if (filter === 'starred') {
    title = 'Belum ada file starred';
    desc = 'Tandai file dengan bintang untuk akses cepat di sini.';
  } else if (filter === 'recent') {
    title = 'Belum ada file recent';
    desc = 'File yang baru diupload akan muncul di sini.';
  } else if (filter === 'trash') {
    title = 'Trash kosong';
    desc = 'File yang dipindahkan ke trash akan muncul di sini.';
  }
  const Icon = filter === 'starred' ? Star : filter === 'trash' ? Trash2 : filter === 'recent' ? Clock : FolderIcon;
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatBytesLocal(bytesStr: string): string {
  const n = Number(bytesStr);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function getMimeLabel(mime: string): string {
  if (mime.startsWith('image/')) return 'Gambar';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'Spreadsheet';
  if (mime.includes('document') || mime.includes('word')) return 'Dokumen';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'Presentasi';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('rar')) return 'Arsip';
  if (mime.startsWith('text/')) return 'Teks';
  if (mime.includes('json')) return 'JSON';
  if (mime.includes('xml')) return 'XML';
  return mime.split('/').pop() || 'File';
}
