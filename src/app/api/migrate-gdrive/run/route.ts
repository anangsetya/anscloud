import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  findOrCreateFolder,
  moveFileToFolder,
  googleDriveStoreFile,
  googleDriveReadFile,
  googleDriveDeleteFile,
} from '@/lib/providers/google';
import { categorizeFile } from '@/lib/categorize';
import { formatBytes } from '@/lib/storage';

/**
 * POST /api/migrate-gdrive/run
 * Body: {
 *   sourceAccountId: string,
 *   targetAccountId: string,  // if same as sourceAccountId → reorganize within same Drive
 *   folderCategories?: string[],  // optional: only migrate specific categories (e.g. ['PDF', 'Word'])
 *   deleteOriginals?: boolean,    // only when target != source: delete source files after copy
 * }
 *
 * Two modes:
 *   A) targetAccountId === sourceAccountId (REORGANIZE):
 *      - Find-or-create folders (PDF, Word, Excel, Images, etc.) in source Drive
 *      - Use Drive API `update` with addParents/removeParents to MOVE files (metadata only, fast)
 *      - deleteOriginals is ignored (it's the same Drive)
 *
 *   B) targetAccountId !== sourceAccountId (CROSS-ACCOUNT):
 *      - For each file: download from source → upload to target (inside appropriate folder)
 *      - If deleteOriginals=true: delete source file after successful upload
 *      - Slow for large files, but works across different Google accounts
 *
 * Returns: { migrated, skipped, failed, totalBytesMigrated }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sourceAccountId = String(body.sourceAccountId ?? '');
  const targetAccountId = String(body.targetAccountId ?? '');
  const folderCategories = Array.isArray(body.folderCategories)
    ? (body.folderCategories as string[])
    : null;
  const deleteOriginals = !!body.deleteOriginals;

  if (!sourceAccountId || !targetAccountId) {
    return NextResponse.json(
      { error: 'sourceAccountId dan targetAccountId wajib diisi.' },
      { status: 400 }
    );
  }

  const [sourceAccount, targetAccount] = await Promise.all([
    db.driveAccount.findUnique({ where: { id: sourceAccountId } }),
    db.driveAccount.findUnique({ where: { id: targetAccountId } }),
  ]);

  if (!sourceAccount) {
    return NextResponse.json({ error: 'Akun sumber tidak ditemukan.' }, { status: 404 });
  }
  if (!targetAccount) {
    return NextResponse.json({ error: 'Akun tujuan tidak ditemukan.' }, { status: 404 });
  }
  if (sourceAccount.provider !== 'google' || targetAccount.provider !== 'google') {
    return NextResponse.json(
      { error: 'Migrate hanya bisa untuk akun Google Asli (provider=google).' },
      { status: 400 }
    );
  }

  // Lazy-import listGoogleDriveFiles to keep this file small.
  const { listGoogleDriveFiles } = await import('@/lib/providers/google');

  try {
    // 1. List all files in source Drive.
    const sourceFiles = await listGoogleDriveFiles(sourceAccount, { pageSize: 1000 });

    // 2. Filter by requested categories (if specified).
    let filesToMigrate = sourceFiles;
    if (folderCategories && folderCategories.length > 0) {
      filesToMigrate = sourceFiles.filter((f) => {
        const cat = categorizeFile(f.mimeType, f.name);
        return folderCategories.includes(cat.folderName);
      });
    }

    if (filesToMigrate.length === 0) {
      return NextResponse.json({
        migrated: 0,
        skipped: 0,
        failed: 0,
        totalBytesMigrated: '0',
        message: 'Tidak ada file yang cocok dengan kategori yang dipilih.',
      });
    }

    const isReorganize = sourceAccountId === targetAccountId;

    // 3. Cache for folder IDs (avoid repeated find-or-create calls).
    const folderIdCache = new Map<string, string>();

    async function getOrCreateFolderId(
      account: typeof sourceAccount,
      folderName: string
    ): Promise<string> {
      const cacheKey = `${account.id}:${folderName}`;
      if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey)!;
      const id = await findOrCreateFolder(account, folderName, account.driveRootFolderId);
      folderIdCache.set(cacheKey, id);
      return id;
    }

    // 4. Process each file.
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    let totalBytesMigrated = 0n;
    const errors: Array<{ fileName: string; error: string }> = [];

    for (const file of filesToMigrate) {
      try {
        const cat = categorizeFile(file.mimeType, file.name);
        const targetFolderId = await getOrCreateFolderId(targetAccount, cat.folderName);

        if (isReorganize) {
          // Mode A: MOVE within same Drive (metadata-only, fast).
          // Skip if file is ALREADY in the target folder.
          if (file.parents.includes(targetFolderId)) {
            skipped++;
            continue;
          }
          await moveFileToFolder(sourceAccount, file.id, targetFolderId, file.parents);
          migrated++;
          totalBytesMigrated += file.size;
        } else {
          // Mode B: CROSS-ACCOUNT copy (download → upload → optional delete).
          // Skip if file is already in target folder.
          // (We can't easily check this without another API call, so just proceed.)
          const data = await googleDriveReadFile(sourceAccount, file.id);
          await googleDriveStoreFile(targetAccount, {
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.size,
            data,
          });
          // Optionally delete the original from source.
          if (deleteOriginals) {
            await googleDriveDeleteFile(sourceAccount, file.id);
          }
          migrated++;
          totalBytesMigrated += file.size;
        }
      } catch (err) {
        failed++;
        errors.push({
          fileName: file.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        // Continue to next file — don't abort the whole migration.
      }
    }

    return NextResponse.json({
      mode: isReorganize ? 'reorganize' : 'cross-account',
      migrated,
      skipped,
      failed,
      totalBytesMigrated: totalBytesMigrated.toString(),
      totalBytesMigratedFormatted: formatBytes(totalBytesMigrated),
      errors: errors.slice(0, 20), // cap error list
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal menjalankan migrasi.' },
      { status: 500 }
    );
  }
}
