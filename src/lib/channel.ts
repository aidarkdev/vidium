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
}

// ── Statements ────────────────────────────────────────────────────────────────

const stmtGetById = db.prepare(
  `SELECT id, name, display_name, url, youtube_channel_id, tags FROM channels WHERE id = ?`,
);
const stmtGetByUrl = db.prepare(`SELECT id FROM channels WHERE url = ?`);
const stmtInsert = db.prepare(
  `INSERT INTO channels (name, url, tags) VALUES (?, ?, ?) ON CONFLICT (url) DO NOTHING`,
);
const stmtUpdateYtId = db.prepare(`UPDATE channels SET youtube_channel_id = ? WHERE id = ?`);
const stmtUpdateCrawled = db.prepare(
  `UPDATE channels SET last_crawled = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
);
const stmtGetAllTags = db.prepare(`SELECT DISTINCT tags FROM channels WHERE tags != ''`);
const stmtGetLabels = db.prepare(`SELECT tag, label FROM tag_labels`);
const stmtSetLabel = db.prepare(
  `INSERT INTO tag_labels (tag, label) VALUES (?, ?) ON CONFLICT (tag) DO UPDATE SET label = excluded.label`,
);
const stmtGetAllChannelNames = db.prepare(`SELECT id, name FROM channels`);
const stmtSetDisplayName = db.prepare(`UPDATE channels SET display_name = ? WHERE id = ?`);
const stmtGetAll = db.prepare(
  `SELECT id, name, display_name, url, youtube_channel_id, tags
   FROM channels
   ORDER BY COALESCE(NULLIF(display_name,''), name)`,
);
const stmtGetRss = db.prepare(
  `SELECT id, youtube_channel_id FROM channels WHERE youtube_channel_id != ''`,
);

// ── Internal ──────────────────────────────────────────────────────────────────

type RawChannel = {
  id: number;
  name: string;
  display_name: string;
  url: string;
  youtube_channel_id: string;
  tags: string;
};

function toChannel(r: RawChannel): Channel {
  return {
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    url: r.url,
    youtubeChannelId: r.youtube_channel_id,
    tags: r.tags,
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
): { id: number; created: boolean } {
  const result = stmtInsert.run(name, url, tags);
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

/** Returns tags list with 'ready', 'all', 'manual' pinned first. */
export function getAllTags(): string[] {
  const PINNED = ['ready', 'all', 'manual'];
  const rest = [
    ...new Set(
      (stmtGetAllTags.all() as { tags: string }[])
        .flatMap((r) => r.tags.split(','))
        .filter((t) => t && !PINNED.includes(t)),
    ),
  ];
  return [...PINNED, ...rest];
}

export function getTagLabels(): Record<string, string> {
  return Object.fromEntries(
    (stmtGetLabels.all() as { tag: string; label: string }[]).map((r) => [r.tag, r.label]),
  );
}

export function setTagLabel(tag: string, label: string): void {
  stmtSetLabel.run(tag, label);
  const channels = stmtGetAllChannelNames.all() as { id: number; name: string }[];
  for (const ch of channels) {
    const slug = ch.name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (slug === tag) stmtSetDisplayName.run(label, ch.id);
  }
}

export function getAllChannels(): Channel[] {
  return (stmtGetAll.all() as RawChannel[]).map(toChannel);
}

export function getRssChannels(): { id: number; youtubeChannelId: string }[] {
  return (stmtGetRss.all() as { id: number; youtube_channel_id: string }[]).map((r) => ({
    id: r.id,
    youtubeChannelId: r.youtube_channel_id,
  }));
}
