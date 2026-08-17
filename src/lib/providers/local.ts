import { promises as fs } from 'fs';
import path from 'path';

/**
 * LocalProvider — stores files on the local filesystem.
 *
 * Used in DEMO MODE (provider='local') to simulate Google Drive accounts
 * without requiring real OAuth credentials. Each account gets its own bucket
 * directory under /home/z/my-project/storage/{accountId}/.
 *
 * For REAL Google Drive storage, see GoogleDriveProvider.
 */

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function localStoreFile(
  accountId: string,
  file: { name: string; mimeType: string; sizeBytes: bigint; data: Buffer }
): Promise<{ physicalFileId: string }> {
  const bucketDir = path.join(STORAGE_ROOT, accountId);
  await ensureDir(bucketDir);

  const safeExt = path.extname(file.name).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
  const physicalFileId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
  const fullPath = path.join(bucketDir, physicalFileId);
  await fs.writeFile(fullPath, file.data);
  return { physicalFileId };
}

export async function localReadFile(
  _accountId: string,
  physicalFileId: string
): Promise<Buffer> {
  const fullPath = path.join(STORAGE_ROOT, _accountId, physicalFileId);
  return fs.readFile(fullPath);
}

export async function localDeleteFile(
  _accountId: string,
  physicalFileId: string
): Promise<void> {
  const fullPath = path.join(STORAGE_ROOT, _accountId, physicalFileId);
  try {
    await fs.unlink(fullPath);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code !== 'ENOENT') {
      throw err;
    }
  }
}

export async function localCleanupAccount(accountId: string): Promise<void> {
  try {
    await fs.rm(path.join(STORAGE_ROOT, accountId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}
