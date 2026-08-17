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
      a.href = url; a.download = 'anscloud-source.tar.gz';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
    } catch {
      window.open('/api/download-source', '_blank');
      setDone(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-3">
          <AnsCloudLogo className="h-10 w-10 shrink-0" />
          <span className="text-xl font-semibold tracking-tight">AnsCloud</span>
        </div>

        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <FileArchive className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Download Source Code</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  File <code className="rounded bg-muted px-1">anscloud-source.tar.gz</code> (±250KB)
                </p>
              </div>
              <div className="w-full space-y-2 rounded-xl border bg-muted/30 p-4 text-left text-xs">
                <div className="flex items-center gap-2"><Code className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">Source code</span><span className="ml-auto text-muted-foreground">~95 file</span></div>
                <div className="flex items-center gap-2"><Code className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">API routes</span><span className="ml-auto text-muted-foreground">~25 file</span></div>
                <div className="flex items-center gap-2"><Code className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">UI components</span><span className="ml-auto text-muted-foreground">~65 file</span></div>
              </div>
              <Button onClick={handleDownload} disabled={downloading} className="w-full" size="lg">
                {downloading ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Menyiapkan…</>)
                : done ? (<><CheckCircle2 className="mr-2 h-5 w-5" />Download selesai!</>)
                : (<><Download className="mr-2 h-5 w-5" />Download Source Code</>)}
              </Button>
              {done && (
                <div className="w-full rounded-xl border p-4 text-sm text-muted-foreground">
                  <p className="font-medium">Extract & run:</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                    <code>{`tar -xzf anscloud-source.tar.gz
cd anscloud
bun install
cp .env.example .env
bun run db:push
bun run dev`}</code>
                  </pre>
                </div>
              )}
              <Link href="/login" className="inline-flex items-center gap-1 text-sm link-blue">
                <ArrowLeft className="h-3.5 w-3.5" />Kembali ke login
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">© 2026 AnsCloud</p>
      </div>
    </div>
  );
}
