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
  ArrowUp,
  ArrowDown,
  FolderInput,
  FileText,
  Table as TableIcon,
  Image as ImageIcon,
  Video,
  Music,
  FileQuestion,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { FileIcon, FolderIcon } from './file-icon';
import { FilePreviewDialog } from './file-preview-dialog';
import { ShareDialog } from './share-dialog';
import { VersionHistoryDialog } from './version-history-dialog';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/file-utils';

interface FolderItem {
  id: string;
  name: string;
  type: 'folder';
  createdAt: string;
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
  type: 'file';
}
type Item = FolderItem | FileItem;

type SortKey = 'name' | 'size' | 'date' | 'type' | 'location';
type SortOrder = 'asc' | 'desc';

interface FileBrowserProps {
  refreshKey: number;
  search: string;
  onRefresh: () => void;
  currentFolderId: string | null;
  onFolderChange: (id: string | null) => void;
  filter?: 'recent' | 'starred' | 'trash' | null;
}

/** Simple client-side categorizer (mirrors server-side categorizeFile logic) */
function clientCategorizeFile(mimeType: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg','tiff','tif','ico','heic','heif','raw','psd','ai'].includes(ext)) return 'Images';
  if (mime === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || ['doc','docx','odt','rtf'].includes(ext)) return 'Word';
  if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('officedocument.spreadsheetml') || ['xls','xlsx','ods','csv','tsv'].includes(ext)) return 'Excel';
  if (mime.startsWith('video/') || ['mp4','avi','mov','wmv','flv','webm','mkv','m4v','mpg','mpeg','3gp'].includes(ext)) return 'Video';
  if (mime.startsWith('audio/') || ['mp3','wav','flac','aac','ogg','wma','m4a','opus','aiff'].includes(ext)) return 'Audio';
  return 'Others';
}

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

  // ── Sorting state ───────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // ── Move-to-folder dialog state ─────────────────────────────
  const [moveTarget, setMoveTarget] = useState<FileItem | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveFolders, setMoveFolders] = useState<Array<{ id: string; name: string; path?: string }>>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveFetchLoading, setMoveFetchLoading] = useState(false);

  const { toast } = useToast();

  // ── Sorting logic ───────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  }

  const sortedItems = useMemo(() => {
    const folders = items.filter((i) => i.type === 'folder');
    const files = items.filter((i) => i.type === 'file');

    // Folders always sorted by name only.
    folders.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));

    // Sort files by the selected key.
    const dir = sortOrder === 'asc' ? 1 : -1;
    files.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'id-ID');
          break;
        case 'size': {
          const sa = Number(a.sizeBytes) || 0;
          const sb = Number(b.sizeBytes) || 0;
          cmp = sa - sb;
          break;
        }
        case 'date':
          cmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
          break;
        case 'type':
          cmp = a.mimeType.localeCompare(b.mimeType);
          break;
        case 'location':
          cmp = a.driveAccountEmail.localeCompare(b.driveAccountEmail);
          break;
      }
      return cmp * dir;
    });

    return [...folders, ...files];
  }, [items, sortBy, sortOrder]);

  const sortLabels: Record<SortKey, string> = {
    name: 'Nama',
    size: 'Ukuran',
    date: 'Terakhir diubah',
    type: 'Jenis file',
    location: 'Lokasi',
  };

  // ── Move-to-folder helpers ──────────────────────────────────
  async function fetchAllFolders() {
    setMoveFetchLoading(true);
    try {
      const res = await fetch('/api/folders');
      if (!res.ok) throw new Error('Gagal mengambil daftar folder');
      const data = await res.json();
      const fetched: Array<{ id: string; name: string }> = data.folders ?? [];
      setMoveFolders(fetched);
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Gagal mengambil folder',
        variant: 'destructive',
      });
    } finally {
      setMoveFetchLoading(false);
    }
  }

  function openMoveDialog(file: FileItem) {
    setMoveTarget(file);
    setMoveDialogOpen(true);
    fetchAllFolders();
  }

  async function handleMoveToFolder(folderId: string | null) {
    if (!moveTarget) return;
    setMoveLoading(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: moveTarget.id, folderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal memindahkan file');
      }
      toast({ title: 'Berhasil', description: 'File dipindahkan ke folder.' });
      setMoveDialogOpen(false);
      setMoveTarget(null);
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal memindahkan',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setMoveLoading(false);
    }
  }

  async function handleAutoCategorize() {
    if (!moveTarget) return;
    const categoryName = clientCategorizeFile(moveTarget.mimeType, moveTarget.name);

    // Find or create the category folder.
    // First check if it already exists among fetched folders.
    const existing = moveFolders.find((f) => f.name === categoryName);
    if (existing) {
      await handleMoveToFolder(existing.id);
      return;
    }

    // Create the folder, then move.
    setMoveLoading(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal membuat folder');
      }
      const data = await res.json();
      const newFolderId = data.folder?.id;
      if (!newFolderId) throw new Error('Folder ID tidak ditemukan');
      toast({ title: 'Berhasil', description: `File dipindahkan ke folder "${categoryName}".` });
      setMoveDialogOpen(false);
      setMoveTarget(null);
      onRefresh();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Gagal auto-kategorikan',
        variant: 'destructive',
      });
    } finally {
      setMoveLoading(false);
    }
  }

  // ── Data loading ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      let url: string;
      if (search.trim()) {
        url = `/api/files?search=${encodeURIComponent(search.trim())}`;
      } else if (filter) {
        url = `/api/files?filter=${filter}`;
      } else {
        url = `/api/files?folderId=${currentFolderId ?? ''}`;
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
      } else {
        setBreadcrumb(data.breadcrumb ?? [{ id: null, name: 'My AnsCloud' }]);
        const folders: FolderItem[] = (data.folders ?? []).map((f: FolderItem) => ({ ...f }));
        const files: FileItem[] = (data.files ?? []).map((f: FileItem) => ({ ...f }));
        setItems([...folders, ...files]);
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
  }, [currentFolderId, search, filter, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function handleOpenFolder(folderId: string | null) {
    onFolderChange(folderId);
  }

  // ── FIXED: handleDownload accepts string | FileItem ─────────
  function handleDownload(fileOrId: FileItem | string) {
    const id = typeof fileOrId === 'string' ? fileOrId : fileOrId.id;
    window.open(`/api/download?id=${encodeURIComponent(id)}`, '_blank');
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

  /** Download multiple files as a single ZIP archive. */
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

  /** Move a file to a different folder via drag-and-drop. */
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

  // Update previewFile object when items refresh (so star toggle reflects in dialog too)
  useEffect(() => {
    if (previewFile) {
      const updated = items.find((i) => i.id === previewFile.id && i.type === 'file') as FileItem | undefined;
      if (updated && updated.isStarred !== previewFile.isStarred) {
        setPreviewFile(updated);
      }
    }
  }, [items, previewFile]);

  const isTrash = filter === 'trash';
  const isSpecial = filter !== null || !!search.trim();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Breadcrumb & view controls */}
      <div className="flex items-center gap-1 border-b px-6 py-3 text-sm">
        <button
          onClick={() => {
            onFolderChange(null);
            setBreadcrumb([{ id: null, name: 'My AnsCloud' }]);
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
              onClick={() => onFolderChange(b.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              {b.name}
            </button>
          </div>
        ))}
        {breadcrumb.length === 1 && (
          <span className="ml-1 font-medium">{breadcrumb[0].name}</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!isSpecial && (
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
          )}

          {/* Sort dropdown button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Urutkan">
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Urutkan berdasarkan</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(['name', 'size', 'date', 'type', 'location'] as SortKey[]).map((key) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => handleSort(key)}
                  className="flex items-center justify-between gap-4"
                >
                  <span>{sortLabels[key]}</span>
                  {sortBy === key && (
                    sortOrder === 'asc'
                      ? <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />
                      : <ArrowDown className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('unstar')}>
                  <Star className="mr-1 h-3.5 w-3.5" />
                  Unstar
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
                  {zipping ? 'Menyiapkan…' : 'Download ZIP'}
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
            Memuat…
          </div>
        ) : items.length === 0 ? (
          <EmptyState filter={filter} search={search} />
        ) : viewMode === 'list' ? (
          <ListView
            items={sortedItems}
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
            onMoveToFolder={openMoveDialog}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            isTrash={isTrash}
            dragOverFolderId={dragOverFolderId}
            onDragOverFolder={setDragOverFolderId}
            onDragStartFile={setDraggingFileId}
            draggingFileId={draggingFileId}
          />
        ) : (
          <GridView
            items={sortedItems}
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
            onMoveToFolder={openMoveDialog}
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
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Batal
            </Button>
            <Button onClick={confirmRename}>Simpan</Button>
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

      {/* Move-to-folder dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={(o) => !o && setMoveDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pindahkan ke Folder</DialogTitle>
            <DialogDescription>
              Pilih folder tujuan untuk &ldquo;{moveTarget?.name ?? ''}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          {moveFetchLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memuat folder…
            </div>
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {/* Root option */}
              <button
                className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                onClick={() => handleMoveToFolder(null)}
                disabled={moveLoading}
              >
                <Home className="h-4 w-4 text-muted-foreground" />
                <span>Root (tidak di folder)</span>
              </button>

              {/* Folder list */}
              {moveFolders.map((folder) => (
                <button
                  key={folder.id}
                  className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                  onClick={() => handleMoveToFolder(folder.id)}
                  disabled={moveLoading}
                >
                  <FolderIcon className="h-4 w-4 text-amber-500" />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}

              {moveFolders.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Belum ada folder.
                </p>
              )}

              {/* Auto categorize section */}
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Auto kategorikan</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'PDF', icon: FileText, category: 'PDF' },
                    { label: 'Word', icon: FileText, category: 'Word' },
                    { label: 'Excel', icon: TableIcon, category: 'Excel' },
                    { label: 'Images', icon: ImageIcon, category: 'Images' },
                    { label: 'Video', icon: Video, category: 'Video' },
                    { label: 'Audio', icon: Music, category: 'Audio' },
                    { label: 'Others', icon: FileQuestion, category: 'Others' },
                  ].map((cat) => (
                    <Button
                      key={cat.category}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        // Set the target category on moveTarget's internal state
                        // so handleAutoCategorize uses it
                        if (!moveTarget) return;
                        const existing = moveFolders.find((f) => f.name === cat.category);
                        if (existing) {
                          await handleMoveToFolder(existing.id);
                        } else {
                          // Create folder then move
                          setMoveLoading(true);
                          try {
                            const res = await fetch('/api/folders', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: cat.category }),
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}));
                              throw new Error(err.error ?? 'Gagal membuat folder');
                            }
                            const data = await res.json();
                            const newFolderId = data.folder?.id;
                            if (!newFolderId) throw new Error('Folder ID tidak ditemukan');
                            // Now move the file to the new folder
                            const moveRes = await fetch('/api/files', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: moveTarget.id, folderId: newFolderId }),
                            });
                            if (!moveRes.ok) {
                              const err = await moveRes.json().catch(() => ({}));
                              throw new Error(err.error ?? 'Gagal memindahkan file');
                            }
                            toast({
                              title: 'Berhasil',
                              description: `File dipindahkan ke folder "${cat.category}".`,
                            });
                            setMoveDialogOpen(false);
                            setMoveTarget(null);
                            onRefresh();
                          } catch (e) {
                            toast({
                              title: 'Gagal',
                              description: e instanceof Error ? e.message : 'Gagal auto-kategorikan',
                              variant: 'destructive',
                            });
                          } finally {
                            setMoveLoading(false);
                          }
                        }
                      }}
                      disabled={moveLoading}
                    >
                      <cat.icon className="mr-1 h-3 w-3" />
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {moveLoading && (
            <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memindahkan…
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Batal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListView(props: {
  items: Item[];
  onOpenFolder: (id: string | null) => void;
  onDownload: (f: FileItem | string) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  onMoveToFolder: (f: FileItem) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null;
  onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void;
  draggingFileId: string | null;
}) {
  const { items, bulkMode, selectedIds, onToggleSelect, isTrash } = props;
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: bulkMode ? '32px 1fr 120px 180px 180px 40px' : '1fr 120px 180px 180px 40px' }}
      >
        {bulkMode && <span />}
        <span>Nama</span>
        <span>Ukuran</span>
        <span>Disimpan di</span>
        <span>{isTrash ? 'Dihapus' : 'Diunggah'}</span>
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
  onMoveToFolder,
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
  onDownload: (f: FileItem | string) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  onMoveToFolder: (f: FileItem) => void;
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
      style={{ gridTemplateColumns: bulkMode ? '32px 1fr 120px 180px 180px 40px' : '1fr 120px 180px 180px 40px' }}
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
      onClick={() => {
        if (bulkMode) {
          onToggleSelect(item.id);
        } else if (isFile) {
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
        <span className="truncate font-medium">{item.name}</span>
        {isFile && item.isStarred && (
          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
        )}
      </div>
      <span className="text-muted-foreground">
        {item.type === 'folder' ? '—' : item.sizeFormatted ?? formatBytesLocal(item.sizeBytes)}
      </span>
      <span className="text-muted-foreground">
        {item.type === 'folder' ? (
          '—'
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.driveAccountColor }} />
            <span className="truncate">{item.driveAccountEmail}</span>
          </span>
        )}
      </span>
      <span className="text-muted-foreground">
        {new Date(isTrash && isFile ? (item.deletedAt ?? item.createdAt) : item.createdAt).toLocaleDateString('id-ID', {
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
                  <DropdownMenuItem onClick={() => onMoveToFolder(item)}>
                    <FolderInput className="mr-2 h-4 w-4" />
                    Pindahkan ke Folder
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

function GridView(props: {
  items: Item[];
  onOpenFolder: (id: string | null) => void;
  onDownload: (f: FileItem | string) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  onMoveToFolder: (f: FileItem) => void;
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
            onClick={() => {
              if (bulkMode) onToggleSelect(item.id);
              else if (isFile) props.onPreview(item);
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
                      <DropdownMenuItem onClick={() => props.onMoveToFolder(item)}>
                        <FolderInput className="mr-2 h-4 w-4" />
                        Pindahkan ke Folder
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
