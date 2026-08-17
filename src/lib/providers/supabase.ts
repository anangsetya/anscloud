import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Storage Provider — stores file blobs in Supabase Storage.
 *
 * Used when SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY env vars are set
 * (typically in production on Vercel).
 *
 * Each file is stored as an object in the "anscloud-files" bucket, with
 * a path like `{accountId}/{physicalFileId}`. The physicalFileId stored
 * in our DB is the full path within the bucket.
 *
 * Free tier: 500MB storage, 1GB egress/month (per Supabase project).
 * No credit card required.
 */

let cachedClient: SupabaseClient | null = null;

const BUCKET_NAME = 'anscloud-files';

function getSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase belum dikonfigurasi. Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di environment variables.'
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Store a file blob in Supabase Storage.
 * Returns the storage path (used as `physicalFileId` in DB).
 */
export async function supabaseStoreFile(
  accountId: string,
  file: { name: string; mimeType: string; sizeBytes: bigint; data: Buffer }
): Promise<{ physicalFileId: string }> {
  const supabase = getSupabase();

  // Generate a unique storage path: accountId/timestamp-random.ext
  const safeExt = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) ?? '';
  const ext = safeExt ? `.${safeExt}` : '';
  const physicalFileId = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(physicalFileId, file.data, {
      contentType: file.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase upload gagal: ${error.message}`);
  }

  return { physicalFileId };
}

/**
 * Read a file blob from Supabase Storage.
 */
export async function supabaseReadFile(
  _accountId: string,
  physicalFileId: string
): Promise<Buffer> {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(physicalFileId);

  if (error) {
    throw new Error(`Supabase download gagal: ${error.message}`);
  }
  if (!data) {
    throw new Error('Supabase return data kosong');
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete a file blob from Supabase Storage.
 */
export async function supabaseDeleteFile(
  _accountId: string,
  physicalFileId: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([physicalFileId]);

  if (error) {
    // Idempotent — if file already gone, ignore
    if (!error.message.includes('not found')) {
      throw new Error(`Supabase delete gagal: ${error.message}`);
    }
  }
}

/**
 * Cleanup all blobs owned by an account (called when account is disconnected).
 * Lists all objects under the accountId/ prefix and deletes them.
 */
export async function supabaseCleanupAccount(accountId: string): Promise<void> {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(accountId, { limit: 1000 });

  if (error) {
    console.warn(`Supabase cleanup list gagal: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) return;

  const paths = data.map((f) => `${accountId}/${f.name}`);
  const { error: delError } = await supabase.storage.from(BUCKET_NAME).remove(paths);

  if (delError) {
    console.warn(`Supabase cleanup delete gagal: ${delError.message}`);
  }
}

/**
 * Ensure the storage bucket exists. Call this on first deploy.
 * (Run via `bun run scripts/init-supabase.ts`)
 */
export async function ensureBucketExists(): Promise<void> {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    throw new Error(`Gagal list buckets: ${error.message}`);
  }

  const exists = data?.some((b) => b.name === BUCKET_NAME);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false, // private — only accessible via signed URLs or service role
      fileSizeLimit: 100 * 1024 * 1024, // 100MB per file (Supabase free limit)
    });

    if (createError) {
      throw new Error(`Gagal create bucket: ${createError.message}`);
    }
    console.log(`Bucket "${BUCKET_NAME}" berhasil dibuat.`);
  } else {
    console.log(`Bucket "${BUCKET_NAME}" sudah ada.`);
  }
}
