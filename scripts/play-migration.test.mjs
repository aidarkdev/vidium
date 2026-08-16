import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const run = promisify(execFile);

test('legacy play events migrate once into aggregate counts', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vidium-play-migration-'));
  const databasePath = join(temporaryDirectory, 'vidium.db');
  const env = {
    ...process.env,
    PORT: '3000',
    HOST: '127.0.0.1',
    DB_PATH: databasePath,
    MEDIA_DIR: join(temporaryDirectory, 'media'),
    DISK_HIGH_WATERMARK: '0.8',
    DISK_LOW_WATERMARK: '0.6',
    CRAWL_INITIAL: '1',
    INVITE_CODE: 'test-secret-that-is-not-a-default',
    SESSION_MAX_AGE: '60000',
    DEFAULT_LANG: 'en',
  };
  const dbModuleUrl = pathToFileURL(join(import.meta.dirname, '..', 'src/lib/db.ts')).href;

  await run(process.execPath, ['-e', `const { db } = await import('${dbModuleUrl}'); db.close()`], {
    env,
  });

  const legacyDb = new DatabaseSync(databasePath);
  legacyDb.exec(`
    INSERT INTO channels (id, name, url) VALUES (2, 'test', 'migration-test');
    INSERT INTO videos (id, channel_id, uid, youtube_id, title, date)
      VALUES (2, 2, 'migrationuid1234', 'abcdefghijk', 'Test', '2026-01-01');
    INSERT INTO video_play_events (video_id, kind) VALUES (2, 'video');
    INSERT INTO video_play_events (video_id, kind) VALUES (2, 'video');
    DELETE FROM video_play_counts;
    DELETE FROM schema_migrations WHERE name = 'aggregate-play-counts-v1';
  `);
  legacyDb.close();

  await run(process.execPath, ['-e', `const { db } = await import('${dbModuleUrl}'); db.close()`], {
    env,
  });
  await run(process.execPath, ['-e', `const { db } = await import('${dbModuleUrl}'); db.close()`], {
    env,
  });

  const migratedDb = new DatabaseSync(databasePath);
  const row = migratedDb.prepare(`
    SELECT play_count AS count FROM video_play_counts
    WHERE video_id = 2 AND kind = 'video'
  `).get();
  assert.equal(row.count, 2);
  assert.equal(
    migratedDb
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE name = 'aggregate-play-counts-v1'")
      .get().count,
    1,
  );
  migratedDb.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});
