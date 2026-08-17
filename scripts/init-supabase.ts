/**
 * Init script — creates the "anscloud-files" bucket in Supabase Storage.
 *
 * Run this once after deploying to Vercel + setting up Supabase env vars:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/init-supabase.ts
 *
 * Or locally:
 *   1. Copy .env.example to .env
 *   2. Fill in SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
 *   3. Run: bun run scripts/init-supabase.ts
 */
import { ensureBucketExists } from '../src/lib/providers/supabase';

async function main() {
  console.log('Initializing Supabase Storage bucket...');
  try {
    await ensureBucketExists();
    console.log('✓ Supabase Storage ready for AnsCloud.');
  } catch (err) {
    console.error('✗ Init failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
