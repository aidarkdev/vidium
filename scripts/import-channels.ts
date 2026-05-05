/**
 * import-channels.ts — reads a channels file and inserts them into the database.
 * Enqueues a crawl_channel job for each new channel so the worker crawls immediately.
 *
 * File format (one channel per line, tab-separated):
 *   https://www.youtube.com/@channel<TAB>Display name<TAB>tech,podcast
 *   https://www.youtube.com/@another/streams<TAB>Another Channel<TAB>news
 *
 * Display name and tags are optional. Lines starting with # are ignored.
 *
 * Usage:
 *   node --env-file=.env --experimental-sqlite scripts/import-channels.ts
 */

import { readFileSync } from 'node:fs';
import { addChannel } from '../src/lib/channel.ts';
import { enqueue } from '../src/lib/queue.ts';
import { CHANNEL_URL_RE } from '../src/lib/validation.ts';

const DEFAULT_FILE = 'scripts/channels.txt';
const file = process.argv[2] ?? DEFAULT_FILE;

const lines = readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

function parseLine(line: string): { url: string; displayName: string; tags: string } {
  const [url = '', displayName = '', tags = ''] = line.split('\t');
  return {
    url: url.trim(),
    displayName: displayName.trim(),
    tags: tags.trim(),
  };
}

function channelNameFromUrl(url: string): string {
  return decodeURIComponent(url.match(/youtube\.com\/@([^/?#]+)/)?.[1] ?? '');
}

function normalizeTags(rawTags: string): string {
  return rawTags
    .replace(/[^a-zA-Z0-9,_-]/g, '')
    .split(',')
    .filter(Boolean)
    .join(',');
}

let inserted = 0;
let skipped = 0;

for (const line of lines) {
  const { url, displayName, tags: rawTags } = parseLine(line);

  if (!CHANNEL_URL_RE.test(url)) {
    console.warn(`skipping invalid line: ${line}`);
    continue;
  }

  const name = channelNameFromUrl(url);
  const canonicalUrl = `https://www.youtube.com/@${name}`;
  const tags = normalizeTags(rawTags);
  const result = addChannel(name, canonicalUrl, tags, displayName);

  if (!result.created) {
    console.log(`skip (already exists): ${canonicalUrl}`);
    skipped++;
    continue;
  }

  enqueue('crawl_channel', { channelId: result.id, url: canonicalUrl });
  if (url !== canonicalUrl) {
    enqueue('crawl_channel', { channelId: result.id, url });
  }
  console.log(`added: ${canonicalUrl} [${displayName}] [${tags}] -> crawl_channel enqueued`);
  inserted++;
}

console.log(`\ndone: ${inserted} added, ${skipped} skipped`);
