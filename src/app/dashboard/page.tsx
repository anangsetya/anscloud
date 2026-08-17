'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sidebar, type ViewKey } from '@/components/anscloud/sidebar';
import { Topbar } from '@/components/anscloud/topbar';
import { FileBrowser } from '@/components/anscloud/file-browser';
import { UploadDialog, type UploadMode } from '@/components/anscloud/upload-dialog';
import { NewFolderDialog } from '@/components/anscloud/new-folder-dialog';
import { StorageOverview } from '@/components/anscloud/storage-overview';
import { AccountsManager } from '@/components/anscloud/accounts-manager';
import { MigrateView } from '@/components/anscloud/migrate-view';
import { ActivityView } from '@/components/anscloud/activity-view';
import { useStorageSummary } from '@/hooks/use-api';

const UPLOAD_MODE_KEY = 'anscloud:upload-mode';
const MANUAL_DRIVE_KEY = 'anscloud:manual-drive';

export default function Home() {
  const [view, setView] = useState<ViewKey>('files');
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Upload mode state, persisted to localStorage so the user's choice survives reloads.
  // Use lazy initializers so we read localStorage once on mount without triggering
  // a cascading re-render via setState-in-effect.
  const [uploadMode, setUploadMode] = useState<UploadMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const m = localStorage.getItem(UPLOAD_MODE_KEY);
      return m === 'manual' ? 'manual' : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [manualDriveId, setManualDriveId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(MANUAL_DRIVE_KEY);
    } catch {
      return null;
    }
  });

  const { data: storageData, loading: storageLoading, refetch: refetchStorage } = useStorageSummary();

  // Local accounts list (kept in sync with storage summary so AccountsManager
  // doesn't need a separate fetch).
  const accountsList = storageData?.accounts ?? [];

  // Persist upload mode whenever it changes.
  const handleModeChange = useCallback((mode: UploadMode) => {
    setUploadMode(mode);
    try {
      localStorage.setItem(UPLOAD_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  // Persist manual drive selection whenever it changes.
  const handleManualDriveChange = useCallback((id: string | null) => {
    setManualDriveId(id);
    try {
      if (id) localStorage.setItem(MANUAL_DRIVE_KEY, id);
      else localStorage.removeItem(MANUAL_DRIVE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Refresh storage summary whenever files change.
  const refreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refetchStorage();
  }, [refetchStorage]);

  // Auto-seed demo data on first visit if there are no accounts.
  useEffect(() => {
    if (storageLoading) return;
    if (storageData && storageData.aggregate.accountCount === 0) {
      // Fire-and-forget seed; user can delete later.
      fetch('/api/seed-demo', { method: 'POST' })
        .then(() => refetchStorage())
        .catch(() => {});
    }
  }, [storageLoading, storageData, refetchStorage]);

  // Watch currentFolderId changes from FileBrowser (lifted up so the upload
  // dialog knows which folder to upload into).
  function handleFolderChange(id: string | null) {
    setCurrentFolderId(id);
  }

  const title =
    view === 'files'
      ? 'File Saya'
      : view === 'recent'
        ? 'Recent Files'
        : view === 'starred'
          ? 'Starred Files'
          : view === 'trash'
            ? 'Trash'
            : view === 'storage'
              ? 'Ringkasan Storage'
              : view === 'accounts'
                ? 'Akun Google Drive'
                : view === 'activity'
                  ? 'Activity Log'
                  : 'Migrate GDrive';

  const aggregate = storageData?.aggregate;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        view={view}
        onViewChange={setView}
        aggregate={
          aggregate
            ? {
                usedPct: aggregate.usedPct,
                usedBytesFormatted: aggregate.usedBytesFormatted,
                totalBytesFormatted: aggregate.totalBytesFormatted,
                accountCount: aggregate.accountCount,
              }
            : undefined
        }
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          search={search}
          onSearchChange={setSearch}
          onUploadClick={() => setUploadOpen(true)}
          onNewFolderClick={() => setNewFolderOpen(true)}
          onRefresh={refreshAll}
          showFileActions={view === 'files' || view === 'recent' || view === 'starred' || view === 'trash'}
          uploadMode={uploadMode}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          {(view === 'files' || view === 'recent' || view === 'starred' || view === 'trash') && (
            <FileBrowser
              refreshKey={refreshKey}
              search={search}
              onRefresh={refreshAll}
              currentFolderId={currentFolderId}
              onFolderChange={handleFolderChange}
              filter={
                view === 'recent'
                  ? 'recent'
                  : view === 'starred'
                    ? 'starred'
                    : view === 'trash'
                      ? 'trash'
                      : null
              }
            />
          )}
          {view === 'storage' && (
            <StorageOverview data={storageData} loading={storageLoading} />
          )}
          {view === 'accounts' && (
            <AccountsManager
              accounts={accountsList}
              loading={storageLoading}
              onChanged={refreshAll}
            />
          )}
          {view === 'migrate' && (
            <MigrateView
              accounts={accountsList}
              loading={storageLoading}
              onChanged={refreshAll}
            />
          )}
          {view === 'activity' && (
            <ActivityView refreshKey={refreshKey} />
          )}
        </div>
      </main>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        currentFolderId={currentFolderId}
        onUploaded={refreshAll}
        accounts={accountsList}
        mode={uploadMode}
        onModeChange={handleModeChange}
        manualDriveId={manualDriveId}
        onManualDriveChange={handleManualDriveChange}
      />
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        currentFolderId={currentFolderId}
        onCreated={refreshAll}
      />
    </div>
  );
}
