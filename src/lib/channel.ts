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
  autoDownloadVideo: boolean;
  autoDownloadAudio: boolean;
  guestVisible: boolean;
  rssEnabled: boolean;
}

export interface TagLabel {
  tag: string;
  label: string;
  sortOrder: number;
}

// ── Statements ────────────────────────────────────────────────────────────────

const stmtGetById = db.prepare(
  `SELECT c.id, c.name, c.display_name, c.url, c.youtube_channel_id, c.sort_order,
          c.auto_download_video, c.auto_download_audio, c.guest_visible, c.rss_enabled,
          COALESCE(GROUP_CONCAT(ct.tag, ','), '') AS tags
   FROM channels c
   LEFT JOIN channel_tags ct ON ct.channel_id = c.id
   WHERE c.id = ?
   GROUP BY c.id`,
);
const stmtGetByUrl = db.prepare(`SELECT id FROM channels WHERE url = ?`);
const stmtInsert = db.prepare(
  `INSERT INTO channels (name, url, display_name) VALUES (?, ?, ?) ON CONFLICT (url) DO NOTHING`,
);
const stmtUpdateYtId = db.prepare(`UPDATE channels SET youtube_channel_id = ? WHERE id = ?`);
const stmtUpdateCrawled = db.prepare(
  `UPDATE channels SET last_crawled = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
);
const stmtSetDisplayName = db.prepare(`UPDATE channels SET display_name = ? WHERE id = ?`);
const stmtGetAll = db.prepare(
  `SELECT c.id, c.name, c.display_name, c.url, c.youtube_channel_id, c.sort_order,
          c.auto_download_video, c.auto_download_audio, c.guest_visible, c.rss_enabled,
          COALESCE(GROUP_CONCAT(ct.tag, ','), '') AS tags
   FROM channels c
   LEFT JOIN channel_tags ct ON ct.channel_id = c.id
   GROUP BY c.id
   ORDER BY CASE WHEN c.sort_order = 0 THEN 1 ELSE 0 END,
            c.sort_order ASC,
            COALESCE(NULLIF(c.display_name,''), c.name),
            c.id ASC`,
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
  `SELECT id, youtube_channel_id, auto_download_video, auto_download_audio
   FROM channels
   WHERE youtube_channel_id != '' AND rss_enabled = 1`,
);
const stmtSetSortOrder = db.prepare(`UPDATE channels SET sort_order = ? WHERE id = ?`);
const stmtSetAutoDownloadVideo = db.prepare(
  `UPDATE channels SET auto_download_video = ? WHERE id = ? AND id != ?`,
);
const stmtSetAutoDownloadAudio = db.prepare(
  `UPDATE channels SET auto_download_audio = ? WHERE id = ? AND id != ?`,
);
const stmtSetGuestVisible = db.prepare(
  `UPDATE channels SET guest_visible = ? WHERE id = ? AND id != ?`,
);
const stmtSetRssEnabled = db.prepare(
  `UPDATE channels SET rss_enabled = ? WHERE id = ? AND id != ?`,
);
const stmtGetOrderedTags = db.prepare(`
  SELECT tl.tag
  FROM tags tl
  WHERE EXISTS (SELECT 1 FROM channel_tags ct WHERE ct.tag = tl.tag)
  ORDER BY CASE WHEN tl.sort_order = 0 THEN 1 ELSE 0 END,
           tl.sort_order ASC,
           COALESCE(NULLIF(tl.label, ''), tl.tag) COLLATE NOCASE,
           tl.tag COLLATE NOCASE
`);
const stmtSetTagSortOrder = db.prepare(`UPDATE tags SET sort_order = ? WHERE tag = ?`);
const stmtDeleteTag = db.prepare(`DELETE FROM tags WHERE tag = ?`);
const stmtDeleteChannelTags = db.prepare(`DELETE FROM channel_tags WHERE channel_id = ?`);
const stmtInsertTagLabel = db.prepare(
  `INSERT INTO tags (tag, label) VALUES (?, ?) ON CONFLICT(tag) DO NOTHING`,
);
const stmtInsertChannelTag = db.prepare(
  `INSERT OR IGNORE INTO channel_tags (channel_id, tag) VALUES (?, ?)`,
);
const stmtGetTags = db.prepare(`
  SELECT tl.tag, COALESCE(NULLIF(tl.label, ''), tl.tag) AS label, tl.sort_order AS sortOrder
  FROM tags tl
  WHERE EXISTS (SELECT 1 FROM channel_tags ct WHERE ct.tag = tl.tag)
  ORDER BY CASE WHEN tl.sort_order = 0 THEN 1 ELSE 0 END,
           tl.sort_order ASC,
           label COLLATE NOCASE,
           tl.tag COLLATE NOCASE
`);
const stmtGetGuestVisibleTags = db.prepare(`
  SELECT tl.tag, COALESCE(NULLIF(tl.label, ''), tl.tag) AS label, tl.sort_order AS sortOrder
  FROM tags tl
  WHERE EXISTS (
    SELECT 1
    FROM channel_tags ct
    JOIN channels c ON c.id = ct.channel_id
    JOIN videos v ON v.channel_id = c.id
    WHERE ct.tag = tl.tag
      AND c.guest_visible = 1
      AND c.id != ?
  )
  ORDER BY CASE WHEN tl.sort_order = 0 THEN 1 ELSE 0 END,
           tl.sort_order ASC,
           label COLLATE NOCASE,
           tl.tag COLLATE NOCASE
`);
const stmtGetTag = db.prepare(
  `SELECT tag, COALESCE(NULLIF(label, ''), tag) AS label, sort_order AS sortOrder FROM tags WHERE tag = ?`,
);

// ── Internal ──────────────────────────────────────────────────────────────────

type RawChannel = {
  id: number;
  name: string;
  display_name: string;
  url: string;
  youtube_channel_id: string;
  tags: string;
  sort_order: number;
  auto_download_video: number;
  auto_download_audio: number;
  guest_visible: number;
  rss_enabled: number;
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
    autoDownloadVideo: r.auto_download_video === 1,
    autoDownloadAudio: r.auto_download_audio === 1,
    guestVisible: r.guest_visible === 1,
    rssEnabled: r.rss_enabled === 1,
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
  const result = stmtInsert.run(name, url, displayName);
  const row = stmtGetByUrl.get(url) as { id: number };
  if (result.changes > 0) setChannelTags(row.id, tags);
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
export type TagMoveDirection = 'up' | 'down';

export function setChannelDisplayName(channelId: number, displayName: string): boolean {
  return stmtSetDisplayName.run(displayName, channelId).changes > 0;
}

export function setChannelAutoDownload(
  channelId: number,
  type: 'video' | 'audio',
  enabled: boolean,
): boolean {
  const stmt = type === 'video' ? stmtSetAutoDownloadVideo : stmtSetAutoDownloadAudio;
  return stmt.run(enabled ? 1 : 0, channelId, MANUAL_CHANNEL_ID).changes > 0;
}

export function setChannelGuestVisible(channelId: number, enabled: boolean): boolean {
  return stmtSetGuestVisible.run(enabled ? 1 : 0, channelId, MANUAL_CHANNEL_ID).changes > 0;
}

export function setChannelRssEnabled(channelId: number, enabled: boolean): boolean {
  return stmtSetRssEnabled.run(enabled ? 1 : 0, channelId, MANUAL_CHANNEL_ID).changes > 0;
}

export function getAllChannels(): Channel[] {
  return (stmtGetAll.all() as RawChannel[]).map(toChannel);
}

export function getGuestVisibleChannels(): Channel[] {
  return getAllChannels().filter((channel) => channel.id !== MANUAL_CHANNEL_ID && channel.guestVisible);
}

export function normalizeChannelTags(rawTags: string): string[] {
  const seen = new Set<string>();
  return rawTags
    .replace(/[^\p{L}\p{N},_-]/gu, '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

export function setChannelTags(channelId: number, rawTags: string): boolean {
  const channel = getChannelById(channelId);
  if (!channel || channelId === MANUAL_CHANNEL_ID) return false;

  const tags = normalizeChannelTags(rawTags);
  db.exec('BEGIN');
  try {
    stmtDeleteChannelTags.run(channelId);
    for (const tag of tags) {
      stmtInsertTagLabel.run(tag, tag);
      stmtInsertChannelTag.run(channelId, tag);
    }
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getAllTags(): TagLabel[] {
  return stmtGetTags.all() as unknown as TagLabel[];
}

export function getGuestVisibleTags(): TagLabel[] {
  return stmtGetGuestVisibleTags.all(MANUAL_CHANNEL_ID) as unknown as TagLabel[];
}

export function getTagLabel(tag: string): TagLabel | undefined {
  return stmtGetTag.get(tag) as TagLabel | undefined;
}

export function moveTag(tag: string, direction: TagMoveDirection): boolean {
  const normalized = normalizeChannelTags(tag)[0];
  if (!normalized || normalized !== tag) return false;

  const orderedTags = (stmtGetOrderedTags.all() as { tag: string }[]).map((row) => row.tag);
  const index = orderedTags.indexOf(tag);
  if (index === -1) return false;

  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= orderedTags.length) return false;

  [orderedTags[index], orderedTags[nextIndex]] = [orderedTags[nextIndex], orderedTags[index]];

  db.exec('BEGIN');
  try {
    orderedTags.forEach((item, idx) => {
      stmtSetTagSortOrder.run((idx + 1) * 10, item);
    });
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deleteTag(tag: string): boolean {
  const normalized = normalizeChannelTags(tag)[0];
  if (!normalized || normalized !== tag) return false;

  return stmtDeleteTag.run(tag).changes > 0;
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

export function getRssChannels(): {
  id: number;
  youtubeChannelId: string;
  autoDownloadVideo: boolean;
  autoDownloadAudio: boolean;
}[] {
  return (
    stmtGetRss.all() as {
      id: number;
      youtube_channel_id: string;
      auto_download_video: number;
      auto_download_audio: number;
    }[]
  ).map((r) => ({
    id: r.id,
    youtubeChannelId: r.youtube_channel_id,
    autoDownloadVideo: r.auto_download_video === 1,
    autoDownloadAudio: r.auto_download_audio === 1,
  }));
}
