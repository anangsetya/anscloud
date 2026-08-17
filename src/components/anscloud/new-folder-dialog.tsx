'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface NewFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFolderId: string | null;
  onCreated: () => void;
}

export function NewFolderDialog({
  open,
  onOpenChange,
  currentFolderId,
  onCreated,
}: NewFolderDialogProps) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, parentId: currentFolderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal membuat folder');
      }
      toast({ title: 'Berhasil', description: `Folder "${trimmed}" dibuat.` });
      setName('');
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast({
        title: 'Gagal',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Folder Baru</DialogTitle>
          <DialogDescription>Buat folder virtual untuk mengatur file Anda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="folder-name">Nama folder</Label>
          <Input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Dokumen Penting"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !submitting) handleSubmit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Membuat…' : 'Buat Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
