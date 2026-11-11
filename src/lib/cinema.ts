import { randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.ts';
import { db } from './db.ts';
import { isValidUid } from './validation.ts';

export interface CinemaVideo {
  uid: string;
  title: string;
  created_at: string;
}

export function cinemaPath(uid: string): string {
  if (!isValidUid(uid)) throw new Error('invalid cinema UID');
  return join(config.MEDIA_DIR, 'cinema', `${uid}.mp4`);
}

export function getCinemaVideo(uid: string): CinemaVideo | undefined {
  if (!isValidUid(uid)) return undefined;
  return db.prepare('SELECT * FROM cinema_videos WHERE uid = ?').get(uid) as
    | CinemaVideo
    | undefined;
}

export function createCinemaVideo(title: string): CinemaVideo {
  for (let attempt = 0; attempt < 5; attempt++) {
    const uid = randomBytes(12).toString('base64url');
    const result = db
      .prepare('INSERT OR IGNORE INTO cinema_videos (uid, title) VALUES (?, ?)')
      .run(uid, title);
    if (result.changes) return getCinemaVideo(uid) as CinemaVideo;
  }
  throw new Error('cinema UID generation failed');
}

export function cinemaPage(requestedPage: number) {
  const total = Number(db.prepare('SELECT COUNT(*) AS n FROM cinema_videos').get()?.n);
  const pageCount = Math.max(1, Math.ceil(total / 42));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const items = db
    .prepare('SELECT * FROM cinema_videos ORDER BY created_at DESC, uid DESC LIMIT 42 OFFSET ?')
    .all((page - 1) * 42) as unknown as CinemaVideo[];
  return { items, page, pageCount };
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

// Parents are operator-controlled. Reject a symlink at the cinema directory too.
function trustedCinemaDirectory(): boolean {
  return lstatSync(join(config.MEDIA_DIR, 'cinema')).isDirectory();
}

export function cinemaFileReady(uid: string): boolean {
  const path = cinemaPath(uid);
  let fd: number | undefined;
  try {
    if (!trustedCinemaDirectory()) return false;
    const entry = lstatSync(path);
    if (!entry.isFile() || entry.size === 0) return false;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const file = fstatSync(fd);
    return file.isFile() && file.size > 0;
  } catch (error) {
    if (!missing(error)) console.error('cinema file check failed', error);
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function deleteCinemaVideo(uid: string): void {
  const path = cinemaPath(uid);
  try {
    if (!trustedCinemaDirectory()) throw new Error('unsafe cinema directory');
    for (const file of [path, `${path}.part`]) {
      try {
        unlinkSync(file);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
  } catch (error) {
    if (!missing(error)) throw error;
  }
  db.prepare('DELETE FROM cinema_videos WHERE uid = ?').run(uid);
}
