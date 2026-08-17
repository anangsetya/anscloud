'use client';

import { useState } from 'react';
import { Download, Loader2, CheckCircle2, FileArchive, Code, ArrowLeft } from 'lucide-react';
import { AnsCloudLogo } from '@/components/anscloud/anscloud-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default function DownloadSourcePage() {
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    setDone(false);
    try {
      const res = await fetch('/api/download-source');
      if (!res.ok) throw new Error('Gagal download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'anscloud-source.tar.gz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
    } catch {
      // Fallback: direct window open
      window.open('/api/download-source', '_blank');
      setDone(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20">
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <AnsCloudLogo className="h-12 w-12 shrink-0 drop-shadow-sm" />
          <div className="flex flex-col">
            <span className="text-xl font-bold leading-tight">AnsCloud</span>
            <span className="text-xs text-muted-foreground leading-tight">Source Code Download</span>
          </div>
        </div>

        <Card className="ios-card shadow-xl">
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950">
                <FileArchive className="h-8 w-8 text-emerald-600" />
              </div>

              <div>
                <h1 className="text-lg font-bold">Download Source Code AnsCloud</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  File <code className="rounded bg-muted px-1">anscloud-source.tar.gz</code> (±250KB) berisi 195 file source code lengkap.
                </p>
              </div>

              <div className="w-full space-y-2 rounded-xl border bg-muted/30 p-4 text-left text-xs">
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium">Source code aplikasi</span>
                  <span className="ml-auto text-muted-foreground">~95 file</span>
                </div>
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium">API routes</span>
                  <span className="ml-auto text-muted-foreground">~25 file</span>
                </div>
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium">UI components</span>
                  <span className="ml-auto text-muted-foreground">~65 file</span>
                </div>
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium">Deployment docs</span>
                  <span className="ml-auto text-muted-foreground">4 file</span>
                </div>
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    TIDAK termasuk: node_modules, .next, .env, db, storage
                  </span>
                </div>
              </div>

              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 ios-pressable"
                size="lg"
              >
                {downloading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Menyiapkan download...
                  </>
                ) : done ? (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Download selesai! Cek folder Downloads
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    Download Source Code (.tar.gz)
                  </>
                )}
              </Button>

              {done && (
                <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <p className="font-medium">✓ Download berhasil!</p>
                  <p className="mt-1 text-xs">
                    Extract file <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-900">anscloud-source.tar.gz</code> di komputer kamu, lalu:
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-emerald-100 p-2 text-xs dark:bg-emerald-900">
                    <code>{`tar -xzf anscloud-source.tar.gz
cd anscloud
bun install
cp .env.example .env
# Edit .env dengan kredensial kamu
./scripts/switch-db.sh sqlite
bun run db:push
bun run dev`}</code>
                  </pre>
                </div>
              )}

              <div className="w-full border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Setelah extract & test lokal, push ke GitHub lalu deploy ke Vercel.
                  Baca <code className="rounded bg-muted px-1">DEPLOYMENT-VERCEL.md</code> untuk tutorial lengkap.
                </p>
              </div>

              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Kembali ke login
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} AnsCloud · Multi-Account Google Drive Aggregator
        </p>
      </div>
    </div>
  );
}
