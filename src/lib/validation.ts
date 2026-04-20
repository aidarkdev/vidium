/**
 * validation.ts — shared regex patterns and validators.
 */

export const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
export const CHANNEL_URL_RE =
  /^https?:\/\/(www\.)?youtube\.com\/@[^/?#]+(\/(videos|streams|shorts|playlists|featured))?\/?$/;
export const VIDEO_URL_RE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function isValidVideoId(id: unknown): id is string {
  return typeof id === 'string' && VIDEO_ID_RE.test(id);
}

/** Normalize date to YYYY-MM-DD from either YYYYMMDD (yt-dlp) or ISO-8601 (RSS). */
export function parseDate(raw: string): string {
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw.slice(0, 10);
}
