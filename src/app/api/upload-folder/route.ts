import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pickAccountForFile, storeFile } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * POST /api/upload-folder
 * Multipart form-data:
 *   - files: File[]              (multiple file entries)
 *   - paths: string[]            (parallel array of relative paths, e.g. "docs/readme.txt")
 *   - folderId?: string          (optional parent folder to upload into)
 *
 * Creates virtual folders mirroring the relative path structure, then
 * uploads each file to the appropriate (existing or new) folder.
 *
 * Files in the root of the dropped folder (no slash in path) are uploaded
 * directly to folderId (or root if null).
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Form data tidak valid.' }, { status: 400 });

  const parentFolderId = (form.get('folderId') as string | null) ?? null;

  // Collect all files and their paths.
  const files: Array<{ file: File; path: string }> = [];
  const allFormEntries = Array.from(form.entries());
  for (const [key, value] of allFormEntries) {
    if (key === 'files' && value instanceof File) {
      // Use webkitRelativePath stored in the file's `name` (we hacked it
      // client-side by setting file.name = relativePath). Fallback to just name.
      files.push({ file: value, path: value.name });
    }
    if (key === 'paths' && typeof value === 'string') {
      // paths field is sent as JSON array
      // (handled separately below — actually we use the file.name hack)
    }
  }

  // Read paths separately if provided as JSON
  const pathsJson = form.get('paths') as string | null;
  let pathsArray: string[] = [];
  if (pathsJson) {
    try {
      pathsArray = JSON.parse(pathsJson);
    } catch {
      // ignore
    }
  }
  // If pathsArray provided, override file names with these
  if (pathsArray.length === files.length) {
    files.forEach((f, i) => {
      f.path = pathsArray[i];
    });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'Tidak ada file untuk diupload.' }, { status: 400 });
  }

  if (parentFolderId) {
    const folder = await db.virtualFolder.findFirst({ where: { id: parentFolderId, userId } });
    if (!folder) return NextResponse.json({ error: 'Folder induk tidak ditemukan.' }, { status: 404 });
  }

  // Cache: relativeFolderPath → folderId (to avoid creating duplicates)
  const folderCache = new Map<string, string>();
  if (parentFolderId) folderCache.set('', parentFolderId);
  else folderCache.set('', ''); // root

  async function getOrCreateFolder(relativePath: string): Promise<string | null> {
    // relativePath like "docs/sub/file.txt" → need folder "docs/sub"
    const normalized = relativePath.split('/').filter(Boolean);
    if (normalized.length <= 1) {
      // File in root or directly in parent folder
      return parentFolderId || null;
    }
    // Strip the file name, keep only folder segments
    const folderSegments = normalized.slice(0, -1);
    const folderKey = folderSegments.join('/');
    if (folderCache.has(folderKey)) return folderCache.get(folderKey)!;

    let currentParent = parentFolderId;
    let currentPath = '';
    for (const segment of folderSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (folderCache.has(currentPath)) {
        currentParent = folderCache.get(currentPath)!;
        continue;
      }

      // Find existing folder with this name under currentParent
      const existing = await db.virtualFolder.findFirst({
        where: { userId, name: segment, parentId: currentParent ?? null },
      });
      let folderId: string;
      if (existing) {
        folderId = existing.id;
      } else {
        const created = await db.virtualFolder.create({
          data: { userId, name: segment, parentId: currentParent ?? null },
        });
        folderId = created.id;
      }
      folderCache.set(currentPath, folderId);
      currentParent = folderId;
    }
    return currentParent;
  }

  let uploaded = 0;
  let failed = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const { file, path } of files) {
    try {
      const targetFolderId = await getOrCreateFolder(path);

      const sizeBytes = BigInt(file.size);
      const picked = await pickAccountForFile(userId, sizeBytes);
      const account = await db.driveAccount.findFirst({ where: { id: picked.id, userId } });
      if (!account) throw new Error('Akun tidak ditemukan');

      const buffer = Buffer.from(await file.arrayBuffer());
      const { physicalFileId } = await storeFile(account, {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes,
        data: buffer,
      });

      // Use only the file name (last segment) for the VirtualFile name,
      // since the path structure is captured by the folder hierarchy.
      const fileName = path.split('/').pop() ?? file.name;

      // Auto-versioning: check if file with same name exists in target folder.
      const existing = await db.virtualFile.findFirst({
        where: { userId, name: fileName, folderId: targetFolderId ?? null, deletedAt: null },
      });
      if (existing) {
        await db.fileVersion.create({
          data: {
            fileId: existing.id,
            versionNumber: existing.currentVersion,
            physicalFileId: existing.physicalFileId,
            driveAccountId: existing.driveAccountId,
            sizeBytes: existing.sizeBytes,
            mimeType: existing.mimeType,
          },
        });
        await db.virtualFile.update({
          where: { id: existing.id },
          data: {
            mimeType: file.type || 'application/octet-stream',
            sizeBytes,
            driveAccountId: account.id,
            physicalFileId,
            currentVersion: { increment: 1 },
            updatedAt: new Date(),
          },
        });
      } else {
        await db.virtualFile.create({
          data: {
            userId,
            name: fileName,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes,
            driveAccountId: account.id,
            physicalFileId,
            folderId: targetFolderId ?? null,
          },
        });
      }

      uploaded++;
    } catch (err) {
      failed++;
      errors.push({ path, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  await logActivity(userId, 'upload', {
    fileName: `${files.length} files (folder upload)`,
    details: `Uploaded ${uploaded}, failed ${failed}`,
  });

  return NextResponse.json({
    ok: true,
    uploaded,
    failed,
    errors: errors.slice(0, 20),
  });
}
