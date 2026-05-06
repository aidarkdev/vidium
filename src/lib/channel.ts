/**
 * channel.ts — data access layer for the channels table.
 */

import { db } from './db.ts';

export interface Channel {
  id: number;
  name: string;
  displayName: string;
  url: string;
  youtubeChannelId: string;
  tags: string;
  sortOrder: number;
}

// ── Statements ────────────────────────────────────────────────────────────────

const stmtGetById = db.prepare(
  `SELECT id, name, display_name, url, youtube_channel_id, tags, sort_order FROM channels WHERE id = ?`,
);
const stmtGetByUrl = db.prepare(`SELECT id FROM channels WHERE url = ?`);
const stmtInsert = db.prepare(
  `INSERT INTO channels (name, url, tags, display_name) VALUES (?, ?, ?, ?) ON CONFLICT (url) DO NOTHING`,
);
const stmtUpdateYtId = db.prepare(`UPDATE channels SET youtube_channel_id = ? WHERE id = ?`);
const stmtUpdateCrawled = db.prepare(
  `UPDATE channels SET last_crawled = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
);
const stmtSetDisplayName = db.prepare(`UPDATE channels SET display_name = ? WHERE id = ?`);
const stmtGetAll = db.prepare(
  `SELECT id, name, display_name, url, youtube_channel_id, tags, sort_order
   FROM channels
   ORDER BY CASE WHEN sort_order = 0 THEN 1 ELSE 0 END,
            sort_order ASC,
            COALESCE(NULLIF(display_name,''), name),
            id ASC`,
);
const stmtGetOrderedIds = db.prepare(
  `SELECT id
   FROM channels
   WHERE id != ?
   ORDER BY CASE WHEN sort_order = 0 THEN 1 ELSE 0 END,
            sort_order ASC,
            COALESCE(NULLIF(display_name,''), name),
            id ASC`,
);
const stmtGetRss = db.prepare(
  `SELECT id, youtube_channel_id FROM channels WHERE youtube_channel_id != ''`,
);
const stmtSetSortOrder = db.prepare(`UPDATE channels SET sort_order = ? WHERE id = ?`);

// ── Internal ──────────────────────────────────────────────────────────────────

type RawChannel = {
  id: number;
  name: string;
  display_name: string;
  url: string;
  youtube_channel_id: string;
  tags: string;
  sort_order: number;
};

function toChannel(r: RawChannel): Channel {
  return {
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    url: r.url,
    youtubeChannelId: r.youtube_channel_id,
    tags: r.tags,
    sortOrder: r.sort_order,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getChannelById(id: number): Channel | undefined {
  const r = stmtGetById.get(id) as RawChannel | undefined;
  return r ? toChannel(r) : undefined;
}

/** Insert channel; return its id and whether it was newly created. */
export function addChannel(
  name: string,
  url: string,
  tags: string,
  displayName: string,
): { id: number; created: boolean } {
  const result = stmtInsert.run(name, url, tags, displayName);
  const row = stmtGetByUrl.get(url) as { id: number };
  return { id: row.id, created: result.changes > 0 };
}

export function updateChannelYoutubeId(channelId: number, youtubeChannelId: string): void {
  stmtUpdateYtId.run(youtubeChannelId, channelId);
}

export function updateLastCrawled(channelId: number): void {
  stmtUpdateCrawled.run(channelId);
}

export const MANUAL_CHANNEL_ID = 1;
export type ChannelMoveDirection = 'up' | 'down';

export function setChannelDisplayName(channelId: number, displayName: string): boolean {
  return stmtSetDisplayName.run(displayName, channelId).changes > 0;
}

export function getAllChannels(): Channel[] {
  return (stmtGetAll.all() as RawChannel[]).map(toChannel);
}

export function moveChannel(channelId: number, direction: ChannelMoveDirection): boolean {
  const orderedIds = (stmtGetOrderedIds.all(MANUAL_CHANNEL_ID) as { id: number }[]).map(
    (r) => r.id,
  );
  const index = orderedIds.indexOf(channelId);
  if (index === -1) return false;

  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return false;

  [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];

  db.exec('BEGIN');
  try {
    orderedIds.forEach((id, idx) => {
      stmtSetSortOrder.run((idx + 1) * 10, id);
    });
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getRssChannels(): { id: number; youtubeChannelId: string }[] {
  return (stmtGetRss.all() as { id: number; youtube_channel_id: string }[]).map((r) => ({
    id: r.id,
    youtubeChannelId: r.youtube_channel_id,
  }));
}
