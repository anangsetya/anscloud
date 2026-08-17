import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listGoogleDriveFiles } from '@/lib/providers/google';
import { categorizeFile } from '@/lib/categorize';
import { formatBytes } from '@/lib/storage';

/**
 * POST /api/migrate-gdrive/scan
 * Body: { sourceAccountId: string }
 *
 * Scans all files in the source Google Drive account and returns a preview:
 *   - Total file count & total size
 *   - Files grouped by target folder name (PDF, Word, Excel, Images, etc.)
 *   - Per-file detail: id, name, mimeType, size, target folder
 *
 * Only works for accounts with provider='google' (real OAuth-connected Drive).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sourceAccountId = String(body.sourceAccountId ?? '');

  if (!sourceAccountId) {
    return NextResponse.json({ error: 'sourceAccountId wajib diisi.' }, { status: 400 });
  }

  const account = await db.driveAccount.findUnique({ where: { id: sourceAccountId } });
  if (!account) {
    return NextResponse.json({ error: 'Akun sumber tidak ditemukan.' }, { status: 404 });
  }
  if (account.provider !== 'google') {
    return NextResponse.json(
      {
        error:
          'Migrate hanya bisa untuk akun Google Asli (provider=google). Akun demo (local) tidak bisa di-scan karena file-nya ada di server lokal AnsCloud, bukan di Google Drive Anda.',
      },
      { status: 400 }
    );
  }

  try {
    const files = await listGoogleDriveFiles(account, { pageSize: 1000 });

    // Categorize each file and group by target folder name.
    const grouped: Record<
      string,
      {
        category: string;
        count: number;
        totalBytes: bigint;
        files: Array<{
          id: string;
          name: string;
          mimeType: string;
          sizeBytes: string;
          sizeFormatted: string;
          modifiedTime: string;
        }>;
      }
    > = {};

    let totalBytes = 0n;
    for (const f of files) {
      const cat = categorizeFile(f.mimeType, f.name);
      if (!grouped[cat.folderName]) {
        grouped[cat.folderName] = {
          category: cat.category,
          count: 0,
          totalBytes: 0n,
          files: [],
        };
      }
      grouped[cat.folderName].count++;
      grouped[cat.folderName].totalBytes += f.size;
      grouped[cat.folderName].files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.size.toString(),
        sizeFormatted: formatBytes(f.size),
        modifiedTime: f.modifiedTime.toISOString(),
      });
      totalBytes += f.size;
    }

    // Sort folders alphabetically, with "Others" last.
    const folderNames = Object.keys(grouped).sort((a, b) => {
      if (a === 'Others') return 1;
      if (b === 'Others') return -1;
      return a.localeCompare(b);
    });

    return NextResponse.json({
      sourceAccount: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
      },
      totalFileCount: files.length,
      totalBytes: totalBytes.toString(),
      totalBytesFormatted: formatBytes(totalBytes),
      folders: folderNames.map((name) => ({
        folderName: name,
        category: grouped[name].category,
        count: grouped[name].count,
        totalBytes: grouped[name].totalBytes.toString(),
        totalBytesFormatted: formatBytes(grouped[name].totalBytes),
        files: grouped[name].files,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal scan files dari Google Drive.' },
      { status: 500 }
    );
  }
}
