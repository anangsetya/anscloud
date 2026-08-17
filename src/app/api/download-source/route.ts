import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * GET /api/download-source
 *
 * Public endpoint (no auth required) — downloads the AnsCloud source code
 * as a tar.gz archive. Excludes node_modules, .next, db, storage, .env, etc.
 *
 * This route exists because the Z.ai sandbox UI only exposes PNG files
 * in the download folder. By serving the source via the running app,
 * users can download it directly from the preview panel.
 */
export async function GET() {
  const projectRoot = process.cwd();
  const tmpFile = '/tmp/anscloud-source.tar.gz';

  // Use tar to create the archive, excluding non-source folders/files
  const excludeArgs = [
    '--exclude=./node_modules',
    '--exclude=./.next',
    '--exclude=./db',
    '--exclude=./storage',
    '--exclude=./download',
    '--exclude=./skills',
    '--exclude=./tests',
    '--exclude=./examples',
    '--exclude=./.zscripts',
    '--exclude=./.git',
    '--exclude=./.env',
    '--exclude=./dev.log',
    '--exclude=./server.log',
    '--exclude=./mini-services',
    '--exclude=./upload',
  ].join(' ');

  try {
    execSync(`tar ${excludeArgs} -czf ${tmpFile} .`, {
      cwd: projectRoot,
      stdio: 'pipe',
      timeout: 30000,
    });

    const data = readFileSync(tmpFile);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(data.length),
        'Content-Disposition': 'attachment; filename="anscloud-source.tar.gz"',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Gagal membuat source archive.', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
