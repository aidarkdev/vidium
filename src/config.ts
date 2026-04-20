/**
 * config.ts — reads process.env (populated via --env-file flag).
 *
 * Node.js startup:
 *   node --env-file=.env --experimental-sqlite src/server.ts
 *
 * All values must be set in .env — defaults live there, not here.
 */

export interface Config {
  // HTTP server
  PORT: number;
  HOST: string;
  DOMAIN: string;

  // Database
  DB_PATH: string;

  // Media storage
  MEDIA_DIR: string;
  DISK_HIGH_WATERMARK: number;
  DISK_LOW_WATERMARK: number;

  // yt-dlp
  YTDLP_PROXY: string;
  YTDLP_COOKIES: string;
  YTDLP_SLEEP: number;
  CRAWL_INITIAL: number;

  // Auth
  INVITE_CODE: string;
  SESSION_MAX_AGE: number;

  // i18n
  DEFAULT_LANG: string;
}

const high = parseFloat(process.env.DISK_HIGH_WATERMARK ?? '');
const low = parseFloat(process.env.DISK_LOW_WATERMARK ?? '');

if (low >= high) {
  throw new Error(`DISK_LOW_WATERMARK (${low}) must be less than DISK_HIGH_WATERMARK (${high})`);
}

export const config: Config = {
  PORT: parseInt(process.env.PORT ?? '', 10),
  HOST: process.env.HOST ?? '',
  DOMAIN: process.env.DOMAIN ?? '',

  DB_PATH: process.env.DB_PATH ?? '',

  MEDIA_DIR: process.env.MEDIA_DIR ?? '',
  DISK_HIGH_WATERMARK: high,
  DISK_LOW_WATERMARK: low,

  YTDLP_PROXY: process.env.YTDLP_PROXY ?? '',
  YTDLP_COOKIES: process.env.YTDLP_COOKIES ?? '',
  YTDLP_SLEEP: parseInt(process.env.YTDLP_SLEEP ?? '', 10),
  CRAWL_INITIAL: parseInt(process.env.CRAWL_INITIAL ?? '', 10),

  INVITE_CODE: process.env.INVITE_CODE ?? '',
  SESSION_MAX_AGE: parseInt(process.env.SESSION_MAX_AGE ?? '', 10),

  DEFAULT_LANG: process.env.DEFAULT_LANG ?? '',
};

const required = [
  'PORT',
  'HOST',
  'DOMAIN',
  'DB_PATH',
  'MEDIA_DIR',
  'DISK_HIGH_WATERMARK',
  'DISK_LOW_WATERMARK',
  'YTDLP_SLEEP',
  'CRAWL_INITIAL',
  'INVITE_CODE',
  'SESSION_MAX_AGE',
  'DEFAULT_LANG',
] as const;

for (const key of required) {
  if (!config[key]) throw new Error(`${key} is not set in .env`);
}
