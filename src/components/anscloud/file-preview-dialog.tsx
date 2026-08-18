'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Star, Loader2, AlertTriangle, File as FileIconLucide, X, Maximize2, Minimize2, Film, FileText, Image as ImageIconLucide, Music } from 'lucide-react';
import { FileIcon as TypeIcon } from './file-icon';
import { cn } from '@/lib/utils';

interface FilePreviewDialogProps {
  file: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: string;
    sizeFormatted?: string;
    driveAccountEmail: string;
    driveAccountColor: string;
    isStarred?: boolean;
    icon?: { icon: string; color: string };
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (id: string) => void;
  onToggleStar?: (id: string, current: boolean) => void;
}

function isPreviewableMime(mime: string): boolean {
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('xml') ||
    mime.includes('csv') ||
    mime === 'application/ogg' ||
    mime === 'application/x-mpegURL' ||
    mime.includes('mp4') ||
    mime.includes('webm') ||
    mime.includes('mpeg') ||
    mime.includes('mp3') ||
    mime.includes('wav') ||
    mime.includes('flac') ||
    mime.includes('aac') ||
    mime.includes('svg')
  );
}

function getFileTypeLabel(mime: string, isImage: boolean, isVideo: boolean, isAudio: boolean, isPdf: boolean, isText: boolean): string {
  if (isImage) return 'Gambar';
  if (isVideo) return 'Video';
  if (isAudio) return 'Audio';
  if (isPdf) return 'PDF';
  if (isText) return 'Teks';
  return mime.split('/').pop() ?? 'File';
}

export function FilePreviewDialog({
  file,
  open,
  onOpenChange,
  onDownload,
  onToggleStar,
}: FilePreviewDialogProps) {
  const previewUrl = useMemo(() => {
    if (!file || !open) return null;
    if (!isPreviewableMime(file.mimeType)) return null;
    return `/api/files/preview?id=${encodeURIComponent(file.id)}`;
  }, [file, open]);

  // For PDF, append #view=FitH to auto-fit width in browser's PDF viewer
  const pdfUrl = useMemo(() => {
    if (!previewUrl || file?.mimeType !== 'application/pdf') return null;
    return previewUrl + '#view=FitH';
  }, [previewUrl, file?.mimeType]);

  const [loading, setLoading] = useState(!!previewUrl);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    fetch(previewUrl)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          return r.json().then((b) => {
            throw new Error(b.error ?? `HTTP ${r.status}`);
          });
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat preview');
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (videoRef.current) videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
    };
  }, [previewUrl]);

  // Pause media when dialog closes
  useEffect(() => {
    if (!open) {
      if (videoRef.current) videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
    }
  }, [open]);

  if (!file) return null;

  const mime = file.mimeType;
  const isImage = mime.startsWith('image/') || mime.includes('svg');
  const isVideo =
    mime.startsWith('video/') ||
    mime.includes('mp4') ||
    mime.includes('webm') ||
    mime.includes('mpeg') ||
    mime === 'application/x-mpegURL' ||
    mime === 'application/ogg';
  const isAudio =
    mime.startsWith('audio/') ||
    mime.includes('mp3') ||
    mime.includes('wav') ||
    mime.includes('flac') ||
    mime.includes('aac');
  const isPdf = mime === 'application/pdf';
  const isText =
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('xml') ||
    mime.includes('csv');

  const typeLabel = getFileTypeLabel(mime, isImage, isVideo, isAudio, isPdf, isText);

  // Dynamic icon for the file type badge
  const TypeBadgeIcon = isVideo ? Film : isAudio ? Music : isImage ? ImageIconLucide : isPdf ? FileText : TypeIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[95vh] w-[95vw] max-w-[95vw] overflow-hidden p-0 gap-0',
          'sm:max-w-[95vw]',
          isFullscreen && 'max-h-[100vh] w-[100vw] max-w-[100vw] rounded-none sm:max-w-[100vw]'
        )}
        showCloseButton={false}
      >
        {/* Header bar */}
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-background shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
            title="Tutup"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ color: file.icon?.color ?? file.driveAccountColor }}
          >
            <TypeIcon icon={file.icon?.icon ?? 'file'} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-medium leading-tight" title={file.name}>
              {file.name}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1.5 text-[11px] leading-tight mt-0.5">
              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium">
                <TypeBadgeIcon className={cn('h-3 w-3', isVideo || isAudio || isImage ? '' : '')} style={isVideo || isAudio || isImage ? {} : { color: file.icon?.color ?? file.driveAccountColor }} />
                {typeLabel}
              </span>
              <span className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: file.driveAccountColor }}
              />
              <span className="truncate">{file.driveAccountEmail}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="text-muted-foreground">{file.sizeFormatted ?? formatBytesLocal(file.sizeBytes)}</span>
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleStar && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onToggleStar(file.id, !!file.isStarred)}
                title={file.isStarred ? 'Hapus dari starred' : 'Tandai sebagai starred'}
              >
                <Star className={`h-4 w-4 ${file.isStarred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => onDownload(file.id)}
              className="bg-emerald-600 hover:bg-emerald-700 h-8"
            >
              <Download className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className={cn('overflow-auto bg-muted/30', isFullscreen ? 'max-h-[calc(100vh-49px)]' : 'max-h-[calc(95vh-49px)]')}>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Memuat preview…
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-rose-600">
              <AlertTriangle className="h-8 w-8" />
              <p className="font-medium">Gagal memuat preview</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : !previewUrl ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <FileIconLucide className="h-12 w-12" />
              <div>
                <p className="font-medium">Preview tidak tersedia</p>
                <p className="text-sm">
                  Tipe file <code className="rounded bg-muted px-1 text-xs">{mime}</code> tidak bisa di-preview di browser. Gunakan tombol Download.
                </p>
              </div>
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center p-4 min-h-[300px]">
              <img
                src={previewUrl}
                alt={file.name}
                className="max-h-[85vh] max-w-full rounded-md object-contain shadow-md"
              />
            </div>
          ) : isVideo ? (
            <div className="flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                src={previewUrl}
                controls
                autoPlay
                playsInline
                className="max-h-[85vh] w-full"
              />
            </div>
          ) : isAudio ? (
            <div className="flex flex-col items-center gap-6 py-16">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950 dark:to-orange-950">
                <Music className="h-14 w-14 text-amber-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{file.sizeFormatted ?? formatBytesLocal(file.sizeBytes)}</p>
              </div>
              <audio ref={audioRef} src={previewUrl} controls autoPlay className="w-full max-w-lg px-4" />
            </div>
          ) : isPdf ? (
            <iframe
              src={pdfUrl ?? previewUrl}
              title={file.name}
              className={cn('border-0 bg-white w-full', isFullscreen ? 'h-[calc(100vh-49px)]' : 'h-[85vh]')}
            />
          ) : isText ? (
            <TextPreview url={previewUrl} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        if (cancelled) return;
        setContent(t.length > 100000 ? t.slice(0, 100000) + '\n\n[... truncated]' : t);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat teks');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Memuat teks…</div>;
  if (error) return <div className="p-4 text-sm text-rose-600">{error}</div>;
  return (
    <pre className="max-h-[85vh] overflow-auto bg-slate-900 p-4 text-sm text-slate-100 dark:bg-slate-950">
      <code>{content}</code>
    </pre>
  );
}

function formatBytesLocal(bytesStr: string): string {
  const n = Number(bytesStr);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}