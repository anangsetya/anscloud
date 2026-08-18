'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
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
  Filter,
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
import { FilePreviewDialog, isPreviewableMime } from './file-preview-dialog';
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
  const [history, setHistory] = useState<Array<{ folderId: string | null; breadcrumb: Array<{ id: string | null; name: string }> }>>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickIdRef = useRef<string | null>(null);
  const CLICK_DELAY = 180;
  const { toast } = useToast();

  const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
    { field: 'name', label: 'Nama' },
    { field: 'size', label: 'Ukuran' },
    { field: 'modified', label: 'Terakhir Ubah' },
    { field: 'type', label: 'Jenis File' },
    { field: 'location', label: 'Lokasi Akun' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      let url: string;
      if (search.trim()) {
        url = `/api/files?search=${encodeURIComponent(search.trim())}&sort=${sortField}:${sortDir}`;
      } else if (filter) {
        url = `/api/files?filter=${filter}`;
      } else {
        url = `/api/files?folderId=${currentFolderId ?? ''}&sort=${sortField}:${sortDir}`;
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
  }, [currentFolderId, search, filter, toast, sortField, sortDir]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function navigateToFolder(folderId: string | null, newBreadcrumb?: Array<{ id: string | null; name: string }>) {
    setHistory((prev) => [
      ...prev,
      { folderId: currentFolderId, breadcrumb },
    ]);
    onFolderChange(folderId);
    if (newBreadcrumb) setBreadcrumb(newBreadcrumb);
  }

  function handleBack() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const last = newHistory.pop()!;
      onFolderChange(last.folderId);
      setBreadcrumb(last.breadcrumb);
      return newHistory;
    });
  }

  function handleOpenFolder(folderId: string | null) {
    const newBreadcrumb = [...breadcrumb, { id: folderId, name: items.find(i => i.id === folderId)?.name ?? 'Folder' }];
    navigateToFolder(folderId, newBreadcrumb);
  }

  function handleItemClick(item: Item) {
    const clickId = `${item.type}-${item.id}`;
    if (lastClickIdRef.current === clickId && clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickIdRef.current = null;
      if (item.type === 'folder') handleOpenFolder(item.id);
      else handlePreview(item);
      return;
    }
    lastClickIdRef.current = clickId;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      lastClickIdRef.current = null;
      toggleSelect(item.id);
    }, CLICK_DELAY);
  }

  function handleDownload(file: FileItem) {
    window.open(`/api/download?id=${encodeURIComponent(file.id)}`, '_blank');
  }

  function handlePreview(file: FileItem) {
    setPreviewFile(file);
  }

  function handleSortChange(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
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
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
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
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal menghapus'); }
      toast({ title: 'Berhasil', description: filter === 'trash' || permanent ? `"${item.name}" dihapus permanen.` : `"${item.name}" dipindahkan ke trash.` });
      onRefresh();
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  async function handleRestore(file: FileItem) {
    try {
      const res = await fetch('/api/files/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal restore'); }
      toast({ title: 'Berhasil', description: `"${file.name}" dipulihkan dari trash.` });
      onRefresh();
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  async function handleBulkAction(action: 'delete' | 'permanent_delete' | 'restore' | 'star' | 'unstar' | 'zip') {
    if (selectedIds.size === 0) return;
    if (action === 'zip') { await handleDownloadZip(); return; }
    const msgMap: Record<string, string> = {
      delete: `Pindahkan ${selectedIds.size} file ke trash?`,
      permanent_delete: `Hapus permanen ${selectedIds.size} file? Tidak bisa dikembalikan.`,
      restore: `Pulihkan ${selectedIds.size} file dari trash?`,
      star: `Tandai ${selectedIds.size} file sebagai starred?`,
      unstar: `Hapus starred dari ${selectedIds.size} file?`,
    };
    if (!confirm(msgMap[action])) return;
    try {
      const res = await fetch('/api/files/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds), action }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal bulk action'); }
      const data = await res.json();
      toast({ title: 'Berhasil', description: `${data.processed} file diproses, ${data.failed} gagal.` });
      setBulkMode(false); setSelectedIds(new Set()); onRefresh();
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  async function handleDeleteAllTrash() {
    const trashFiles = items.filter((i) => i.type === 'file');
    if (trashFiles.length === 0) return;
    if (!confirm(`Hapus permanen SEMUA ${trashFiles.length} file di trash? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      const res = await fetch('/api/files/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: trashFiles.map((i) => i.id), action: 'permanent_delete' }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal menghapus'); }
      const data = await res.json();
      toast({ title: 'Berhasil', description: `${data.processed} file dihapus permanen dari trash.` });
      onRefresh();
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  async function handleDownloadZip() {
    if (selectedIds.size === 0) return;
    setZipping(true);
    try {
      const res = await fetch('/api/download-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds), folderName: 'anscloud-files' }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal membuat ZIP'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'anscloud-files.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast({ title: 'ZIP diunduh', description: `${selectedIds.size} file dipaket sebagai ZIP.` });
    } catch (e) {
      toast({ title: 'Gagal membuat ZIP', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally { setZipping(false); }
  }

  async function handleMoveFile(fileId: string, targetFolderId: string | null) {
    try {
      const res = await fetch('/api/files', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fileId, folderId: targetFolderId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal memindahkan file'); }
      toast({ title: 'Berhasil', description: 'File dipindahkan.' });
      onRefresh();
    } catch (e) {
      toast({ title: 'Gagal memindahkan', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function startRename(item: Item) { setRenameTarget(item); setRenameValue(item.name); }

  async function confirmRename() {
    if (!renameTarget) return;
    const name = renameValue.trim(); if (!name) return;
    try {
      const url = renameTarget.type === 'file' ? '/api/files' : '/api/folders';
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: renameTarget.id, name }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Gagal mengganti nama'); }
      toast({ title: 'Berhasil', description: 'Nama diperbarui.' }); setRenameTarget(null); onRefresh();
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  useEffect(() => {
    if (previewFile) {
      const updated = items.find((i) => i.id === previewFile.id && i.type === 'file') as FileItem | undefined;
      if (updated && updated.isStarred !== previewFile.isStarred) setPreviewFile(updated);
    }
  }, [items, previewFile]);

  useEffect(() => { return () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current); }; }, []);

  // File type filter (client-side)
  const TYPE_FILTERS: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'Semua Tipe' },
    { value: 'image', label: 'Gambar' },
    { value: 'video', label: 'Video' },
    { value: 'audio', label: 'Audio' },
    { value: 'document', label: 'Dokumen' },
    { value: 'archive', label: 'Arsip' },
    { value: 'other', label: 'Lainnya' },
  ];

  function matchesTypeFilter(item: Item): boolean {
    if (typeFilter === 'all' || item.type === 'folder') return true;
    const m = (item as FileItem).mimeType ?? '';
    switch (typeFilter) {
      case 'image': return m.startsWith('image/') || m.includes('svg');
      case 'video': return m.startsWith('video/') || ['mp4', 'webm', 'mpeg', '3gp', 'mov'].some(e => m.includes(e));
      case 'audio': return m.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'm4a'].some(e => m.includes(e));
      case 'document': return m === 'application/pdf' || m.includes('word') || m.includes('spreadsheet') || m.includes('presentation') || m.includes('document') || m.startsWith('text/') || m.includes('json') || m.includes('csv');
      case 'archive': return m.includes('zip') || m.includes('rar') || m.includes('compressed') || m.includes('tar') || m.includes('7z') || m.includes('gz');
      default: return !m.startsWith('image/') && !m.startsWith('video/') && !m.startsWith('audio/') && m !== 'application/pdf';
    }
  }

  const filteredItems = useMemo(() => items.filter(matchesTypeFilter), [items, typeFilter]);
  const filteredPreviewableFiles = useMemo(
    () => filteredItems.filter((i): i is FileItem => i.type === 'file' && isPreviewableMime(i.mimeType)),
    [filteredItems]
  );
  const filteredPreviewIndex = useMemo(
    () => (previewFile ? filteredPreviewableFiles.findIndex((f) => f.id === previewFile.id) : -1),
    [previewFile, filteredPreviewableFiles]
  );
  const navPrev = useCallback(() => {
    if (filteredPreviewIndex > 0) setPreviewFile(filteredPreviewableFiles[filteredPreviewIndex - 1]);
  }, [filteredPreviewIndex, filteredPreviewableFiles]);
  const navNext = useCallback(() => {
    if (filteredPreviewIndex < filteredPreviewableFiles.length - 1) setPreviewFile(filteredPreviewableFiles[filteredPreviewIndex + 1]);
  }, [filteredPreviewIndex, filteredPreviewableFiles]);

  const isTrash = filter === 'trash';
  const isSpecial = filter !== null || !!search.trim();
  const canGoBack = history.length > 0 && !isSpecial;
  const activeSortLabel = SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? 'Nama';
  const activeTypeLabel = TYPE_FILTERS.find((o) => o.value === typeFilter)?.label ?? 'Semua';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Breadcrumb, back button, sort & view controls */}
      <div className="flex items-center gap-1 border-b px-4 py-2.5 text-sm">
        <Button variant="ghost" size="icon" className="mr-1 h-8 w-8 shrink-0" onClick={handleBack} disabled={!canGoBack} title="Kembali">
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          onClick={() => { setHistory([]); onFolderChange(null); setBreadcrumb([{ id: null, name: 'My AnsCloud' }]); }}
          className="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" /><span>Root</span>
        </button>
        {breadcrumb.slice(1).map((b, idx) => (
          <div key={`${b.id ?? 'root'}-${idx}`} className="flex shrink-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button onClick={() => onFolderChange(b.id)} className="text-muted-foreground hover:text-foreground">{b.name}</button>
          </div>
        ))}
        {breadcrumb.length === 1 && <span className="ml-1 font-medium">{breadcrumb[0].name}</span>}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Type filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={typeFilter !== 'all' ? 'default' : 'ghost'} size="sm" className="h-8 gap-1 text-xs">
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{activeTypeLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TYPE_FILTERS.map((opt) => (
                <DropdownMenuItem key={opt.value} onClick={() => setTypeFilter(opt.value)}>
                  <span className={cn('w-4 text-center', typeFilter === opt.value && 'font-bold text-primary')}>
                    {typeFilter === opt.value ? '●' : ''}
                  </span>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{activeSortLabel}</span>
                {sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem key={opt.field} onClick={() => handleSortChange(opt.field)}>
                  <span className={cn('w-4 text-center', sortField === opt.field && 'font-bold text-primary')}>
                    {sortField === opt.field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </span>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!isSpecial && (
            <Button variant={bulkMode ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }} title={bulkMode ? 'Keluar mode pilih' : 'Mode pilih banyak'}>
              {bulkMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            </Button>
          )}
          {isTrash && items.length > 0 && (
            <Button variant="destructive" size="sm" className="h-8 gap-1 text-xs" onClick={handleDeleteAllTrash} disabled={loading}>
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Hapus Semua</span>
            </Button>
          )}
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')} title="Tampilan list">
            <ListIcon className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')} title="Tampilan grid">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50 px-6 py-2 dark:bg-emerald-950/30">
          <span className="text-sm font-medium">{selectedIds.size} file dipilih</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {!isTrash && (<>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('star')}><Star className="mr-1 h-3.5 w-3.5" />Star</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('unstar')}><Star className="mr-1 h-3.5 w-3.5" />Unstar</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('zip')} disabled={zipping}>
                {zipping ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileArchive className="mr-1 h-3.5 w-3.5" />}
                {zipping ? 'Menyiapkan…' : 'Download ZIP'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('delete')}><Trash2 className="mr-1 h-3.5 w-3.5" />ke Trash</Button>
            </>)}
            {isTrash && (<>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('restore')}><RotateCcw className="mr-1 h-3.5 w-3.5" />Restore</Button>
              <Button size="sm" variant="destructive" onClick={() => handleBulkAction('permanent_delete')}><Trash2 className="mr-1 h-3.5 w-3.5" />Hapus Permanen</Button>
            </>)}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Memuat…</div>
        ) : filteredItems.length === 0 ? (
          <EmptyState filter={filter} search={search} />
        ) : viewMode === 'list' ? (
          <ListView
            items={filteredItems} sortField={sortField} sortDir={sortDir}
            onSortChange={handleSortChange}
            onItemDoubleClick={handleItemClick}
            onDownload={handleDownload} onPreview={handlePreview}
            onDelete={handleDelete} onRename={startRename}
            onToggleStar={handleToggleStar} onRestore={handleRestore}
            onShare={(f) => setShareTarget({ id: f.id, name: f.name })}
            onVersion={(f) => setVersionTarget({ id: f.id, name: f.name })}
            onMoveFile={handleMoveFile}
            bulkMode={bulkMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
            isTrash={isTrash}
            dragOverFolderId={dragOverFolderId} onDragOverFolder={setDragOverFolderId}
            onDragStartFile={setDraggingFileId} draggingFileId={draggingFileId}
          />
        ) : (
          <GridView
            items={filteredItems}
            onItemDoubleClick={handleItemClick}
            onDownload={handleDownload} onPreview={handlePreview}
            onDelete={handleDelete} onRename={startRename}
            onToggleStar={handleToggleStar} onRestore={handleRestore}
            onShare={(f) => setShareTarget({ id: f.id, name: f.name })}
            onVersion={(f) => setVersionTarget({ id: f.id, name: f.name })}
            onMoveFile={handleMoveFile}
            bulkMode={bulkMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
            isTrash={isTrash}
            dragOverFolderId={dragOverFolderId} onDragOverFolder={setDragOverFolderId}
            onDragStartFile={setDraggingFileId} draggingFileId={draggingFileId}
          />
        )}
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ganti nama</DialogTitle><DialogDescription>{renameTarget?.type === 'folder' ? 'Folder' : 'File'} baru:</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">Nama</Label>
            <Input id="rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Batal</Button>
            <Button onClick={confirmRename}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        file={previewFile}
        open={!!previewFile}
        onOpenChange={(o) => !o && setPreviewFile(null)}
        onDownload={handleDownload}
        onToggleStar={handleToggleStar}
        canGoPrev={filteredPreviewIndex > 0}
        canGoNext={filteredPreviewIndex < filteredPreviewableFiles.length - 1}
        onPrev={navPrev}
        onNext={navNext}
      />
      <ShareDialog file={shareTarget} open={!!shareTarget} onOpenChange={(o) => !o && setShareTarget(null)} />
      <VersionHistoryDialog file={versionTarget} open={!!versionTarget} onOpenChange={(o) => !o && setVersionTarget(null)} onRestored={onRefresh} />
    </div>
  );
}

/* ─── List View ──────────────────────────────────────── */

function ListView(props: {
  items: Item[];
  sortField: SortField; sortDir: SortDir;
  onSortChange: (f: SortField) => void;
  onItemDoubleClick: (item: Item) => void;
  onDownload: (f: FileItem) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  bulkMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null; onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void; draggingFileId: string | null;
}) {
  const { items, bulkMode, sortField, sortDir, isTrash } = props;
  const cols = bulkMode ? '32px 1fr 120px 180px 180px 40px' : '1fr 120px 180px 180px 40px';

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: cols }}>
        {bulkMode && <span />}
        <SortableHeader label="Nama" field="name" current={sortField} dir={sortDir} onClick={props.onSortChange} />
        <SortableHeader label="Ukuran" field="size" current={sortField} dir={sortDir} onClick={props.onSortChange} />
        <SortableHeader label="Disimpan di" field="location" current={sortField} dir={sortDir} onClick={props.onSortChange} />
        <SortableHeader label={isTrash ? 'Dihapus' : 'Diunggah'} field="modified" current={sortField} dir={sortDir} onClick={props.onSortChange} />
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

function SortableHeader({ label, field, current, dir, onClick }: { label: string; field: SortField; current: SortField; dir: SortDir; onClick: (f: SortField) => void }) {
  const active = current === field;
  return (
    <button onClick={() => onClick(field)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}
      {active && (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  );
}

function Row({
  item, onItemDoubleClick, onDownload, onPreview, onDelete, onRename, onToggleStar, onRestore,
  onShare, onVersion, onMoveFile, bulkMode, selectedIds, onToggleSelect, isTrash,
  dragOverFolderId, onDragOverFolder, onDragStartFile, draggingFileId,
}: {
  item: Item;
  onItemDoubleClick: (item: Item) => void;
  onDownload: (f: FileItem) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  bulkMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null; onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void; draggingFileId: string | null;
}) {
  const isFile = item.type === 'file';
  const selected = selectedIds.has(item.id);
  const isDropTarget = !isFile && dragOverFolderId === item.id;
  const cols = bulkMode ? '32px 1fr 120px 180px 180px 40px' : '1fr 120px 180px 180px 40px';

  return (
    <div
      className={cn(
        'grid cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40 select-none',
        selected && 'bg-emerald-50 dark:bg-emerald-950/30',
        isDropTarget && 'ring-2 ring-emerald-500 ring-inset bg-emerald-50 dark:bg-emerald-950/30'
      )}
      style={{ gridTemplateColumns: cols }}
      draggable={isFile && !bulkMode}
      onDragStart={(e) => { if (isFile) { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; onDragStartFile(item.id); } }}
      onDragEnd={() => { onDragStartFile(null); onDragOverFolder(null); }}
      onDragOver={(e) => { if (!isFile && draggingFileId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOverFolder(item.id); } }}
      onDragLeave={() => { if (!isFile && dragOverFolderId === item.id) onDragOverFolder(null); }}
      onDrop={(e) => { if (!isFile && draggingFileId) { e.preventDefault(); onMoveFile(draggingFileId, item.id); onDragStartFile(null); onDragOverFolder(null); } }}
      onClick={() => { if (bulkMode) onToggleSelect(item.id); else onToggleSelect(item.id); }}
      onDoubleClick={() => { if (!bulkMode) { if (isFile) onPreview(item); else onItemDoubleClick(item); } }}
    >
      {bulkMode && (
        <button onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }} className="flex h-5 w-5 items-center justify-center">
          {selected ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
        </button>
      )}
      <div className="flex min-w-0 cursor-pointer items-center gap-3">
        {item.type === 'folder' ? <FolderIcon className="h-5 w-5 shrink-0" /> : <FileIcon icon={item.icon.icon} color={item.icon.color} className="h-5 w-5 shrink-0" />}
        <span className="truncate cursor-pointer font-medium">{item.name}</span>
        {isFile && item.isStarred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
      </div>
      <span className="text-muted-foreground">{item.type === 'folder' ? '—' : item.sizeFormatted ?? formatBytesLocal(item.sizeBytes)}</span>
      <span className="text-muted-foreground">
        {item.type === 'folder' ? '—' : (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.driveAccountColor }} />
            <span className="truncate">{item.driveAccountEmail}</span>
          </span>
        )}
      </span>
      <span className="text-muted-foreground">
        {new Date(isTrash && isFile ? (item.deletedAt ?? item.createdAt) : item.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        {isFile && !bulkMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isTrash && (<>
                <DropdownMenuItem onClick={() => onPreview(item)}><Pencil className="mr-2 h-4 w-4" />Preview</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(item)}><Download className="mr-2 h-4 w-4" />Download</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleStar(item)}><Star className={cn('mr-2 h-4 w-4', item.isStarred && 'fill-amber-400 text-amber-400')} />{item.isStarred ? 'Hapus star' : 'Star'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onShare(item)}><Share2 className="mr-2 h-4 w-4" />Bagikan</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onVersion(item)}><History className="mr-2 h-4 w-4" />Version History</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRename(item)}><Pencil className="mr-2 h-4 w-4" />Ganti nama</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(item)} className="text-rose-600 focus:text-rose-700"><Trash2 className="mr-2 h-4 w-4" />Pindah ke Trash</DropdownMenuItem>
              </>)}
              {isTrash && (<>
                <DropdownMenuItem onClick={() => onRestore(item)}><RotateCcw className="mr-2 h-4 w-4" />Pulihkan</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(item, true)} className="text-rose-600 focus:text-rose-700"><Trash2 className="mr-2 h-4 w-4" />Hapus Permanen</DropdownMenuItem>
              </>)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {item.type === 'folder' && !bulkMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRename(item)}><Pencil className="mr-2 h-4 w-4" />Ganti nama</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(item)} className="text-rose-600 focus:text-rose-700"><Trash2 className="mr-2 h-4 w-4" />Hapus</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

/* ─── Grid View ──────────────────────────────────────── */

function GridView(props: {
  items: Item[];
  onItemDoubleClick: (item: Item) => void;
  onDownload: (f: FileItem) => void;
  onPreview: (f: FileItem) => void;
  onDelete: (i: Item, permanent?: boolean) => void;
  onRename: (i: Item) => void;
  onToggleStar: (f: FileItem) => void;
  onRestore: (f: FileItem) => void;
  onShare: (f: FileItem) => void;
  onVersion: (f: FileItem) => void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => void;
  bulkMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
  isTrash: boolean;
  dragOverFolderId: string | null; onDragOverFolder: (folderId: string | null) => void;
  onDragStartFile: (fileId: string | null) => void; draggingFileId: string | null;
}) {
  const { items, bulkMode, selectedIds, onToggleSelect, isTrash } = props;
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
              'group relative flex cursor-pointer select-none flex-col items-center gap-2 p-4 transition-all hover:shadow-md',
              selected && 'ring-2 ring-emerald-500',
              isDropTarget && 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
            )}
            draggable={isFile && !bulkMode}
            onDragStart={(e) => { if (isFile) { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; props.onDragStartFile(item.id); } }}
            onDragEnd={() => { props.onDragStartFile(null); props.onDragOverFolder(null); }}
            onDragOver={(e) => { if (!isFile && props.draggingFileId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; props.onDragOverFolder(item.id); } }}
            onDragLeave={() => { if (!isFile && props.dragOverFolderId === item.id) props.onDragOverFolder(null); }}
            onDrop={(e) => { if (!isFile && props.draggingFileId) { e.preventDefault(); props.onMoveFile(props.draggingFileId, item.id); props.onDragStartFile(null); props.onDragOverFolder(null); } }}
            onClick={() => { if (bulkMode) onToggleSelect(item.id); else onToggleSelect(item.id); }}
            onDoubleClick={() => { if (!bulkMode) { if (isFile) props.onPreview(item); else props.onItemDoubleClick(item); } }}
          >
            {bulkMode && (
              <div className="absolute left-1.5 top-1.5">
                {selected ? <CheckSquare className="h-5 w-5 text-emerald-600" /> : <Square className="h-5 w-5 text-muted-foreground" />}
              </div>
            )}
            <div className="flex h-16 w-16 items-center justify-center">
              {item.type === 'folder' ? <FolderIcon className="h-12 w-12" /> : <FileIcon icon={item.icon.icon} color={item.icon.color} className="h-12 w-12" />}
            </div>
            <div className="w-full text-center">
              <div className="truncate cursor-pointer text-sm font-medium" title={item.name}>{item.name}</div>
              <div className="text-[11px] text-muted-foreground">{item.type === 'folder' ? 'Folder' : item.sizeFormatted ?? formatBytesLocal(item.sizeBytes)}</div>
              {isFile && (
                <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.driveAccountColor }} />
                  <span className="truncate">{item.driveAccountEmail.split('@')[0]}</span>
                  {item.isStarred && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                </div>
              )}
            </div>
            <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!isTrash && isFile && (<>
                    <DropdownMenuItem onClick={() => props.onDownload(item)}><Download className="mr-2 h-4 w-4" />Download</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onToggleStar(item)}><Star className={cn('mr-2 h-4 w-4', item.isStarred && 'fill-amber-400 text-amber-400')} />{item.isStarred ? 'Hapus star' : 'Star'}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onShare(item)}><Share2 className="mr-2 h-4 w-4" />Bagikan</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onVersion(item)}><History className="mr-2 h-4 w-4" />Version History</DropdownMenuItem>
                  </>)}
                  {isTrash && isFile && <DropdownMenuItem onClick={() => props.onRestore(item)}><RotateCcw className="mr-2 h-4 w-4" />Pulihkan</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => props.onRename(item)}><Pencil className="mr-2 h-4 w-4" />Ganti nama</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => props.onDelete(item, isTrash)} className="text-rose-600 focus:text-rose-700"><Trash2 className="mr-2 h-4 w-4" />{isTrash ? 'Hapus Permanen' : 'Pindah ke Trash'}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ─── Empty State ────────────────────────────────────── */

function EmptyState({ filter, search }: { filter: string | null; search: string }) {
  let title = 'Folder kosong';
  let desc = 'Upload file pertama Anda, atau buat folder baru untuk mulai mengatur.';
  if (search.trim()) { title = 'Tidak ada hasil'; desc = `Tidak ada file yang cocok dengan "${search.trim()}".`; }
  else if (filter === 'starred') { title = 'Belum ada file starred'; desc = 'Tandai file dengan bintang untuk akses cepat di sini.'; }
  else if (filter === 'recent') { title = 'Belum ada file recent'; desc = 'File yang baru diupload akan muncul di sini.'; }
  else if (filter === 'trash') { title = 'Trash kosong'; desc = 'File yang dipindahkan ke trash akan muncul di sini.'; }
  const Icon = filter === 'starred' ? Star : filter === 'trash' ? Trash2 : filter === 'recent' ? Clock : FolderIcon;
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Icon className="h-8 w-8 text-muted-foreground" /></div>
      <div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{desc}</p></div>
    </div>
  );
}

function formatBytesLocal(bytesStr: string): string {
  const n = Number(bytesStr);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}