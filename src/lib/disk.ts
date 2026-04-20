/**
 * disk.ts — checks disk usage via df and cleans up old media files
 * when usage exceeds the high watermark.
 */

import { spawn } from 'node:child_process';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { config } from '../config.ts';

// ── df ────────────────────────────────────────────────────────────────────────

function getDiskUsage(): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('df', ['--output=pcent', config.MEDIA_DIR]);
    const out: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`df exited with code ${code}`));
      const lines = Buffer.concat(out).toString().trim().split('\n');
      resolve(parseInt(lines[1], 10) / 100);
    });
    proc.on('error', reject);
  });
}

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

async function cleanup(onDeleted: (file: DeletedFile) => void): Promise<void> {
  const dirs = ['videos', 'audio', 'thumbs'].map((d) => join(config.MEDIA_DIR, d));
  let files: FileEntry[] = [];
  for (const dir of dirs) {
    files = files.concat(collectFiles(dir));
  }
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (let i = 0; i < files.length; i++) {
    if (i % 10 === 0) {
      const usage = await getDiskUsage();
      if (usage <= config.DISK_LOW_WATERMARK) break;
    }
    const filePath = files[i].path;
    const dir = basename(dirname(filePath));
    unlinkSync(filePath);
    console.log(`disk cleanup: removed ${filePath}`);
    if (dir === 'videos' || dir === 'audio') {
      onDeleted({
        youtubeId: basename(filePath, extname(filePath)),
        type: dir === 'videos' ? 'video' : 'audio',
      });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkDisk(onDeleted: (file: DeletedFile) => void): Promise<void> {
  const usage = await getDiskUsage();
  if (usage >= config.DISK_HIGH_WATERMARK) {
    console.log(`disk usage ${Math.round(usage * 100)}% — starting cleanup`);
    await cleanup(onDeleted);
  }
}
