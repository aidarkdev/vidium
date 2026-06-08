/**
 * disk.ts — checks disk usage and cleans up old video/audio files
 * when usage exceeds the high watermark.
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { config } from '../config.ts';
import { getDiskUsageRatio } from './disk-status.ts';

// ── Cleanup ───────────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  mtimeMs: number;
}

function collectFiles(dir: string): FileEntry[] {
  try {
    return readdirSync(dir)
      .map((name) => {
        const path = join(dir, name);
        return { path, mtimeMs: statSync(path).mtimeMs };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
  } catch {
    return [];
  }
}

export type MediaType = 'video' | 'audio';

export interface DeletedFile {
  youtubeId: string;
  type: MediaType;
}

function getDiskUsage(): number | undefined {
  return getDiskUsageRatio();
}

async function cleanup(onDeleted: (file: DeletedFile) => void): Promise<void> {
  const dirs = ['videos', 'audio'].map((d) => join(config.MEDIA_DIR, d));
  let files: FileEntry[] = [];
  for (const dir of dirs) {
    files = files.concat(collectFiles(dir));
  }
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (let i = 0; i < files.length; i++) {
    if (i % 10 === 0) {
      const usage = getDiskUsage();
      if (usage === undefined || usage <= config.DISK_LOW_WATERMARK) break;
    }
    const filePath = files[i].path;
    const dir = basename(dirname(filePath));
    unlinkSync(filePath);
    console.log(`disk cleanup: removed ${filePath}`);
    onDeleted({
      youtubeId: basename(filePath, extname(filePath)),
      type: dir === 'videos' ? 'video' : 'audio',
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkDisk(onDeleted: (file: DeletedFile) => void): Promise<void> {
  const usage = getDiskUsage();
  if (usage === undefined) return;
  if (usage >= config.DISK_HIGH_WATERMARK) {
    console.log(`disk usage ${Math.round(usage * 100)}% — starting cleanup`);
    await cleanup(onDeleted);
  }
}
