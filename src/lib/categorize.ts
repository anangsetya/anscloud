/**
 * Categorize a file's MIME type / filename into a capitalized folder name.
 *
 * Rules (per user spec):
 *   - All image types → "Images" (single folder for any image format)
 *   - PDF → "PDF"
 *   - Word (.doc/.docx) → "Word"
 *   - Excel (.xls/.xlsx/.csv) → "Excel"
 *   - PowerPoint (.ppt/.pptx) → "Powerpoint"
 *   - Video (any) → "Video"
 *   - Audio (any) → "Audio"
 *   - Archives (zip/rar/7z/tar/gz) → "Archive"
 *   - Code files (.js/.ts/.py/.java/etc) → "Code"
 *   - Text (.txt/.md/.rtf) → "Text"
 *   - Unknown / other → "Others"
 *
 * Folder names are always Capitalized first letter (Title Case for multi-word).
 */

export interface CategorizationResult {
  folderName: string;
  category: string; // machine-readable key (lowercase)
}

export function categorizeFile(
  mimeType: string,
  filename: string
): CategorizationResult {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = (mimeType || '').toLowerCase();

  // 1. Images — ALL image types go to "Images" folder
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'ico', 'heic', 'heif', 'raw', 'psd', 'ai'].includes(ext)) {
    return { folderName: 'Images', category: 'images' };
  }

  // 2. PDF
  if (mime === 'application/pdf' || ext === 'pdf') {
    return { folderName: 'PDF', category: 'pdf' };
  }

  // 3. Word
  if (
    mime.includes('word') ||
    mime.includes('officedocument.wordprocessingml') ||
    ['doc', 'docx', 'odt', 'rtf'].includes(ext)
  ) {
    return { folderName: 'Word', category: 'word' };
  }

  // 4. Excel
  if (
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime.includes('officedocument.spreadsheetml') ||
    ['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(ext)
  ) {
    return { folderName: 'Excel', category: 'excel' };
  }

  // 5. PowerPoint
  if (
    mime.includes('powerpoint') ||
    mime.includes('presentation') ||
    mime.includes('officedocument.presentationml') ||
    ['ppt', 'pptx', 'odp', 'key'].includes(ext)
  ) {
    return { folderName: 'Powerpoint', category: 'powerpoint' };
  }

  // 6. Video
  if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', 'mpg', 'mpeg', '3gp'].includes(ext)) {
    return { folderName: 'Video', category: 'video' };
  }

  // 7. Audio
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aiff'].includes(ext)) {
    return { folderName: 'Audio', category: 'audio' };
  }

  // 8. Archives
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar') ||
    mime.includes('rar') ||
    mime.includes('7z') ||
    ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'].includes(ext)
  ) {
    return { folderName: 'Archive', category: 'archive' };
  }

  // 9. Code
  if (
    [
      'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb',
      'php', 'swift', 'kt', 'rs', 'sh', 'bash', 'zsh', 'ps1', 'sql', 'json',
      'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'html', 'css', 'scss', 'less',
    ].includes(ext)
  ) {
    return { folderName: 'Code', category: 'code' };
  }

  // 10. Text
  if (mime.startsWith('text/') || ['txt', 'md', 'markdown', 'log'].includes(ext)) {
    return { folderName: 'Text', category: 'text' };
  }

  // 11. Fallback
  return { folderName: 'Others', category: 'others' };
}

/**
 * Group a list of files by their target folder name.
 * Returns a map: folderName → fileCount
 */
export function groupByCategory<T extends { mimeType: string; name: string }>(
  files: T[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const cat = categorizeFile(f.mimeType, f.name);
    counts[cat.folderName] = (counts[cat.folderName] ?? 0) + 1;
  }
  return counts;
}
