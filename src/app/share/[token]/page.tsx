'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Download, Loader2, AlertCircle, Lock, File as FileIcon, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { AnsCloudLogo } from '@/components/anscloud/anscloud-logo';

interface FileMeta {
  name: string;
  mimeType: string;
  sizeBytes: string;
}

export default function SharedFilePage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function loadShare(pass?: string) {
    setLoading(true);
    setError(null);
    setNeedsPassword(false);
    try {
      const url = pass
        ? `/api/share/${token}?password=${encodeURIComponent(pass)}`
        : `/api/share/${token}`;
      const res = await fetch(url);

      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        if (body.needsPassword) {
          setNeedsPassword(true);
          setLoading(false);
          return;
        }
        throw new Error(body.error ?? 'Unauthorized');
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      // If response is JSON (large file or read error), it's metadata-only
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = await res.json();
        setFileMeta(body.file);
        setPreviewUrl(null);
      } else {
        // It's the actual file content — preview inline
        setPreviewUrl(url);
        setFileMeta({
          name: res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'shared-file',
          mimeType: contentType,
          sizeBytes: res.headers.get('Content-Length') ?? '0',
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShare();
  }, [token]);

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
  }

  function handleDownload() {
    if (previewUrl) {
      window.open(previewUrl + '&download=1', '_blank');
    } else if (token) {
      window.open(`/api/share/${token}?download=1`, '_blank');
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <AnsCloudLogo className="h-10 w-10 shrink-0" />
          <span className="text-xl font-semibold tracking-tight">AnsCloud</span>
        </div>

        <Card>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Memuat file…</p>
              </div>
            ) : error ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3 text-rose-600">
                <AlertCircle className="h-12 w-12" />
                <div className="text-center">
                  <p className="font-semibold">Gagal memuat</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
            ) : needsPassword ? (
              <div className="space-y-4 py-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                    <Lock className="h-7 w-7 text-amber-600" />
                  </div>
                  <p className="font-semibold">Link dilindungi password</p>
                  <p className="text-sm text-muted-foreground">Masukkan password untuk melihat file.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && password) loadShare(password);
                    }}
                    autoFocus
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => password && loadShare(password)}
                  disabled={!password}
                >
                  Buka File
                </Button>
              </div>
            ) : fileMeta ? (
              <div className="space-y-4">
                {/* File info header */}
                <div className="flex items-start gap-3 border-b pb-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <FileIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-semibold" title={fileMeta.name}>
                      {fileMeta.name}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {fileMeta.mimeType} · {formatBytes(Number(fileMeta.sizeBytes))}
                    </p>
                  </div>
                  <Button
                    onClick={handleDownload}
                    className=""
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>

                {/* Preview */}
                {previewUrl ? (
                  <PreviewContent url={previewUrl} mimeType={fileMeta.mimeType} name={fileMeta.name} />
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Eye className="h-8 w-8" />
                    <p className="text-sm">File terlalu besar untuk preview. Gunakan tombol Download.</p>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">© 2026 AnsCloud</p>
      </div>
    </div>
  );
}

function PreviewContent({
  url,
  mimeType,
  name,
}: {
  url: string;
  mimeType: string;
  name: string;
}) {
  if (mimeType.startsWith('image/')) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-muted p-4">
      </div>
    );
  }
  if (mimeType.startsWith('video/')) {
    return (
      <video src={url} controls className="mx-auto max-h-[70vh] max-w-full rounded-xl" />
    );
  }
  if (mimeType.startsWith('audio/')) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <audio src={url} controls className="w-full max-w-md" />
      </div>
    );
  }
  if (mimeType === 'application/pdf') {
    return (
      <iframe src={url} title={name} className="h-[70vh] w-full rounded-xl border-0 bg-white" />
    );
  }
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript')) {
    return <TextPreview url={url} />;
  }
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
      <FileIcon className="h-8 w-8" />
      <p className="text-sm">Preview tidak tersedia untuk tipe file ini. Gunakan tombol Download.</p>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        setContent(t.length > 100000 ? t.slice(0, 100000) + '\n\n[... truncated]' : t);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [url]);

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Memuat teks…</div>;
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100 dark:bg-slate-950">
      <code>{content}</code>
    </pre>
  );
}
