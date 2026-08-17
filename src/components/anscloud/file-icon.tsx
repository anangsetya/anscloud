'use client';

import {
  File,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  Sheet,
  Presentation,
  Folder,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: File,
  'file-text': FileText,
  image: ImageIcon,
  film: Film,
  music: Music,
  'file-archive': FileArchive,
  sheet: Sheet,
  presentation: Presentation,
};

interface FileIconProps {
  icon: string;
  color?: string;
  className?: string;
}

export function FileIcon({ icon, color, className }: FileIconProps) {
  const Icon = ICONS[icon] ?? File;
  return (
    <div
      className={cn('flex items-center justify-center rounded-md', className)}
      style={color ? { color } : undefined}
    >
      <Icon className="h-full w-full" />
    </div>
  );
}

export function FolderIcon({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center text-amber-500', className)}>
      <Folder className="h-full w-full" />
    </div>
  );
}
