/**
 * check-zombie-media.ts — lists media files on disk with no matching videos row.
 *
 * Scans MEDIA_DIR/videos, /audio, /thumbs. A file is a "zombie" when its basename
 * (without extension) is not present in videos.youtube_id.
 *
 * Usage:
 *   node --env-file=.env --experimental-sqlite scripts/check-zombie-media.ts
 */

import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { config } from '../src/config.ts';
import { db } from '../src/lib/db.ts';

const MEDIA_DIRS = [
  { kind: 'video', dir: 'videos', ext: '.mp4' },
  { kind: 'audio', dir: 'audio', ext: '.m4a' },
  { kind: 'thumb', dir: 'thumbs', ext: '.jpg' },
] as const;

type ZombieRow = {
  kind: string;
  youtubeId: string;
  path: string;
  bytes: number;
};

function loadKnownYoutubeIds(): Set<string> {
  const rows = db.prepare('SELECT youtube_id FROM videos').all() as { youtube_id: string }[];
  return new Set(rows.map((row) => row.youtube_id));
}

function scanDir(
  kind: string,
  dirPath: string,
  expectedExt: string,
  knownIds: Set<string>,
): { zombies: ZombieRow[]; unexpected: string[] } {
  const zombies: ZombieRow[] = [];
  const unexpected: string[] = [];

  let names: string[];
  try {
    names = readdirSync(dirPath);
  } catch {
    return { zombies, unexpected };
  }

  for (const name of names) {
    const path = join(dirPath, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const ext = extname(name);
    if (ext !== expectedExt) {
      unexpected.push(path);
      continue;
    }

    const youtubeId = basename(name, ext);
    if (knownIds.has(youtubeId)) continue;

    zombies.push({ kind, youtubeId, path, bytes: stat.size });
  }

  return { zombies, unexpected };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

const knownIds = loadKnownYoutubeIds();
const allZombies: ZombieRow[] = [];
const allUnexpected: string[] = [];

for (const { kind, dir, ext } of MEDIA_DIRS) {
  const { zombies, unexpected } = scanDir(kind, join(config.MEDIA_DIR, dir), ext, knownIds);
  allZombies.push(...zombies);
  allUnexpected.push(...unexpected);
}

allZombies.sort((a, b) => a.path.localeCompare(b.path));

const totalBytes = allZombies.reduce((sum, row) => sum + row.bytes, 0);

console.log(`MEDIA_DIR: ${config.MEDIA_DIR}`);
console.log(`videos in db: ${knownIds.size}`);
console.log(`zombie files: ${allZombies.length} (${formatBytes(totalBytes)})`);

if (allZombies.length > 0) {
  console.log('');
  for (const row of allZombies) {
    console.log(`${row.kind}\t${row.youtubeId}\t${formatBytes(row.bytes)}\t${row.path}`);
  }
}

if (allUnexpected.length > 0) {
  console.log('');
  console.log(`unexpected files: ${allUnexpected.length}`);
  for (const path of allUnexpected.sort()) {
    console.log(path);
  }
}

process.exit(allZombies.length > 0 ? 1 : 0);
