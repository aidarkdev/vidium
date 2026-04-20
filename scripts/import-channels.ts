/**
 * import-channels.ts — reads a channels file and inserts them into the database.
 * Enqueues a crawl_channel job for each new channel so the worker crawls immediately.
 *
 * File format (one channel per line, fields separated by tab or multiple spaces):
 *   https://www.youtube.com/@channel   tech,podcast
 *   https://www.youtube.com/@another   news
 *
 * Tags are optional. Lines starting with # are ignored.
 *
 * Usage:
 *   node --env-file=.env --experimental-sqlite scripts/import-channels.ts channels.txt
 */

import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db.ts';
import { enqueue } from '../src/lib/queue.ts';

const file = process.argv[2];

if (!file) {
  console.error('Usage: node --env-file=.env scripts/import-channels.ts <file>');
  process.exit(1);
}

const lines = readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const stmtInsert = db.prepare(`
  INSERT INTO channels (name, url, tags)
  VALUES (?, ?, ?)
  ON CONFLICT (url) DO NOTHING
`);

const stmtGetByUrl = db.prepare(`
  SELECT id FROM channels WHERE url = ?
`);

let inserted = 0;
let skipped = 0;

for (const line of lines) {
  const [url, tags = ''] = line.split(/\s+/);

  if (!url.startsWith('http')) {
    console.warn(`skipping invalid line: ${line}`);
    continue;
  }

  const name = url.replace(/https?:\/\/(www\.)?youtube\.com\/@?/, '');
  const result = stmtInsert.run(name, url, tags.trim());

  if (result.changes === 0) {
    console.log(`skip (already exists): ${url}`);
    skipped++;
    continue;
  }

  const row = stmtGetByUrl.get(url) as { id: number };
  enqueue('crawl_channel', { channelId: row.id, url });
  console.log(`added: ${url} [${tags}] → crawl_channel enqueued`);
  inserted++;
}

console.log(`\ndone: ${inserted} added, ${skipped} skipped`);
