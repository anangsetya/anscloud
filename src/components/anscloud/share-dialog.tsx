'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Trash2, Loader2, Globe, Lock, Calendar, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShareDialogProps {
  file: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShareLink {
  id: string;
  token: string;
  fileId: string;
  hasPassword: boolean;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
  createdAt: string;
}

export function ShareDialog({ file, open, onOpenChange }: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [downloadLimit, setDownloadLimit] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !file) {
      setLinks([]);
      setPassword('');
      setExpiryDays('');
      setDownloadLimit('');
      return;
    }
    setLoading(true);
    fetch(`/api/share?fileId=${file.id}`)
      .then((r) => r.json())
      .then((d) => setLinks(d.links ?? []))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [open, file]);

  async function handleCreate() {
    if (!file) return;
    setCreating(true);
    try {
      const body: { fileId: string; password?: string; expiresAt?: string; downloadLimit?: number } = {
        fileId: file.id,
      };
      if (password.trim()) body.password = password.trim();
      if (expiryDays) {
        const d = new Date();
        d.setDate(d.getDate() + Number(expiryDays));
        body.expiresAt = d.toISOString();
      }
      if (downloadLimit) body.downloadLimit = Number(downloadLimit);

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal membuat share link');
      }
      const data = await res.json();
      setLinks([data.link, ...links]);
      setPassword('');
      setExpiryDays('');
      setDownloadLimit('');
      toast({ title: 'Share link dibuat', description: 'Link siap dibagikan.' });
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Cabut share link ini? Yang sudah punya link tidak bisa akses lagi.')) return;
    try {
      const res = await fetch(`/api/share?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal mencabut link');
      setLinks(links.filter((l) => l.id !== id));
      toast({ title: 'Link dicabut' });
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedToken(token);
        toast({ title: 'Link disalin ke clipboard' });
        setTimeout(() => setCopiedToken(null), 2000);
      })
      .catch(() => toast({ title: 'Gagal menyalin', variant: 'destructive' }));
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bagikan File</DialogTitle>
          <DialogDescription>
            Buat link publik untuk <strong>{file.name}</strong>. Siapa pun dengan link
            bisa mengakses file tanpa login.
          </DialogDescription>
        </DialogHeader>

        {/* Create new link */}
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">Buat Link Baru</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="share-password" className="text-xs">Password (opsional)</Label>
              <Input
                id="share-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Kosongkan jika publik"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-expiry" className="text-xs">Kedaluwarsa (hari)</Label>
              <Input
                id="share-expiry"
                type="number"
                min="1"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                placeholder="Kosongkan jika permanen"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-limit" className="text-xs">Batas download</Label>
              <Input
                id="share-limit"
                type="number"
                min="1"
                value={downloadLimit}
                onChange={(e) => setDownloadLimit(e.target.value)}
                placeholder="Kosongkan jika tanpa batas"
              />
            </div>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="w-full bg-emerald-600 hover:bg-emerald-700 ios-pressable"
          >
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
            Buat Link
          </Button>
        </div>

        {/* Existing links */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Link Aktif ({links.length})</h3>
          {loading ? (
            <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memuat…
            </div>
          ) : links.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Belum ada link aktif. Buat link baru di atas.
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="rounded-xl border bg-card p-3"
                >
                  <div className="flex items-start gap-2">
                    {link.hasPassword ? (
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : (
                      <Globe className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-mono" title={`${window.location.origin}/share/${link.token}`}>
                        {window.location.origin}/share/{link.token.substring(0, 16)}...
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {link.expiresAt && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(link.expiresAt).toLocaleDateString('id-ID')}
                          </span>
                        )}
                        {link.downloadLimit !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {link.downloadCount}/{link.downloadLimit}
                          </span>
                        )}
                        <span>Dibuat {new Date(link.createdAt).toLocaleDateString('id-ID')}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(link.token)}
                      className="ios-pressable"
                    >
                      {copiedToken === link.token ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(link.id)}
                      className="ios-pressable text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
