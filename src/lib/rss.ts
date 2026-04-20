/**
 * rss.ts — fetches and parses YouTube channel Atom feed.
 *
 * Feed URL: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 * Feed contains up to 15 most recent videos.
 */

import { isValidVideoId, parseDate } from './validation.ts';

/** Decode common HTML entities found in YouTube feed titles. */
function decodeEntities(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&#x2F;', '/');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RssEntry {
  youtubeId: string;
  title: string;
  date: string;
}

// ── Internal ──────────────────────────────────────────────────────────────────

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

function extract(entry: string, tag: string): string {
  const match = entry.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, 's'),
  );
  return match ? match[1].trim() : '';
}

function parseEntry(raw: string): RssEntry | null {
  const id = extract(raw, 'yt:videoId');
  if (!isValidVideoId(id)) return null;
  return {
    youtubeId: id,
    title: decodeEntities(extract(raw, 'title')),
    date: parseDate(extract(raw, 'published')),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchFeed(channelId: string): Promise<RssEntry[]> {
  const res = await fetch(`${FEED_URL}${channelId}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`RSS fetch failed for channel ${channelId}: ${res.status}`);

  const xml = await res.text();
  return xml
    .split('<entry>')
    .slice(1)
    .map((chunk) => parseEntry(chunk.split('</entry>')[0]))
    .filter((e): e is RssEntry => e !== null);
}
