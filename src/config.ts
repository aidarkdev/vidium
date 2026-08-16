/**
 * config.ts — reads process.env (populated via --env-file flag).
 *
 * Node.js startup:
 *   node --env-file=.env src/server.ts
 *
 * Required runtime values are loaded from .env. Optional values are documented
 * in SETUP.md; ASSET_MANIFEST_PATH has a code fallback for local development.
 */

import { join } from 'node:path';

export interface Config {
  // HTTP server
  PORT: number;
  HOST: string;

  // Database
  DB_PATH: string;

  // Media storage
  MEDIA_DIR: string;
  DISK_HIGH_WATERMARK: number;
  DISK_LOW_WATERMARK: number;

  // yt-dlp
  YTDLP_PROXY: string;
  PROXY_STATUS_PATH: string;
  YTDLP_COOKIES: string;
  CRAWL_INITIAL: number;

  // Auth
  INVITE_CODE: string;
  SESSION_MAX_AGE: number;

  // i18n
  DEFAULT_LANG: 'en' | 'ru';

  // Prepared browser assets (optional — missing manifest falls back to source paths)
  ASSET_MANIFEST_PATH: string;
}

function requiredString(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`${key} is not set in .env`);
  }
  return value;
}

function requiredNumber(key: string): number {
  const value = Number(requiredString(key));
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

function requiredInteger(key: string): number {
  const value = requiredNumber(key);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${key} must be an integer`);
  }
  return value;
}

function requiredLanguage(): 'en' | 'ru' {
  const value = requiredString('DEFAULT_LANG');
  if (value !== 'en' && value !== 'ru') {
    throw new Error('DEFAULT_LANG must be one of: en, ru');
  }
  return value;
}

export const config: Config = {
  PORT: requiredInteger('PORT'),
  HOST: requiredString('HOST'),

  DB_PATH: requiredString('DB_PATH'),

  MEDIA_DIR: requiredString('MEDIA_DIR'),
  DISK_HIGH_WATERMARK: requiredNumber('DISK_HIGH_WATERMARK'),
  DISK_LOW_WATERMARK: requiredNumber('DISK_LOW_WATERMARK'),

  YTDLP_PROXY: process.env.YTDLP_PROXY ?? '',
  PROXY_STATUS_PATH: process.env.PROXY_STATUS_PATH ?? '',
  YTDLP_COOKIES: process.env.YTDLP_COOKIES ?? '',
  CRAWL_INITIAL: requiredInteger('CRAWL_INITIAL'),

  INVITE_CODE: requiredString('INVITE_CODE'),
  SESSION_MAX_AGE: requiredInteger('SESSION_MAX_AGE'),

  DEFAULT_LANG: requiredLanguage(),

  ASSET_MANIFEST_PATH:
    process.env.ASSET_MANIFEST_PATH ?? join(process.cwd(), 'deploy', 'asset-manifest.json'),
};

if (config.HOST !== '127.0.0.1') {
  throw new Error('HOST must be 127.0.0.1 to match the nginx backend');
}

if (config.PORT !== 3000) {
  throw new Error('PORT must be 3000 to match the nginx backend');
}

if (
  config.DISK_LOW_WATERMARK < 0 ||
  config.DISK_HIGH_WATERMARK > 1 ||
  config.DISK_LOW_WATERMARK >= config.DISK_HIGH_WATERMARK
) {
  throw new Error(
    'DISK watermarks must satisfy 0 <= DISK_LOW_WATERMARK < DISK_HIGH_WATERMARK <= 1',
  );
}

if (config.CRAWL_INITIAL < 1) {
  throw new Error('CRAWL_INITIAL must be a positive integer');
}

if (config.SESSION_MAX_AGE < 1) {
  throw new Error('SESSION_MAX_AGE must be a positive integer');
}

if (config.YTDLP_PROXY && !config.PROXY_STATUS_PATH) {
  throw new Error('PROXY_STATUS_PATH must be set when YTDLP_PROXY is configured');
}

const unsafeInviteCodes = new Set([
  'changeme',
  'change-me',
  'password',
  'invite',
  'secret',
  'admin',
  'default',
  'vidium',
  'test',
]);

if (config.INVITE_CODE.trim() !== config.INVITE_CODE || !config.INVITE_CODE.trim()) {
  throw new Error('INVITE_CODE must be a non-empty secret without surrounding whitespace');
}

if (unsafeInviteCodes.has(config.INVITE_CODE.toLowerCase())) {
  throw new Error('INVITE_CODE must not use a known default value');
}
