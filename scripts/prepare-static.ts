/**
 * Prepares browser assets for deploy with content-hashed filenames.
 *
 * Usage:
 *   node scripts/prepare-static.ts
 *   node scripts/prepare-static.ts --out tmp/vidium-static
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_OUT = join(ROOT, 'tmp', 'vidium-static');

const PART_BROWSER_FILES = new Set(['index.js', 'template.js', 'handlers.js']);
const JS_IMPORT_RE = /\b(?:from|import)\s+(['"])(\.[^'"]+\.js)\1/g;

interface AssetFile {
  absPath: string;
  logicalPath: string;
  hash: string;
  hashedName: string;
  outRelPath: string;
}

function parseArgs(): string {
  const outIdx = process.argv.indexOf('--out');
  if (outIdx === -1) return DEFAULT_OUT;
  const out = process.argv[outIdx + 1];
  if (!out) throw new Error('--out requires a path');
  return resolve(out);
}

function contentHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

function hashedFilename(name: string, hash: string): string {
  const ext = extname(name);
  const base = basename(name, ext);
  return `${base}.${hash}${ext}`;
}

function logicalPathFromAbs(absPath: string): string {
  const rel = relative(join(ROOT, 'src'), absPath).replaceAll('\\', '/');
  return `/${rel}`;
}

function outRelPathFromLogical(logicalPath: string, hashedName: string): string {
  const dir = dirname(logicalPath.slice(1));
  return dir === '.' ? hashedName : `${dir}/${hashedName}`;
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs)));
    } else if (entry.isFile()) {
      files.push(abs);
    }
  }
  return files;
}

async function discoverAssets(): Promise<string[]> {
  const files: string[] = [];

  const engineDir = join(ROOT, 'src', 'engine');
  for (const abs of await walkFiles(engineDir)) {
    if (abs.endsWith('.js')) files.push(abs);
  }

  const partsDir = join(ROOT, 'src', 'parts');
  for (const partDir of await readdir(partsDir, { withFileTypes: true })) {
    if (!partDir.isDirectory()) continue;
    for (const name of PART_BROWSER_FILES) {
      files.push(join(partsDir, partDir.name, name));
    }
  }

  const staticDir = join(ROOT, 'src', 'static');
  files.push(...(await walkFiles(staticDir)));

  const existing: string[] = [];
  for (const abs of files) {
    try {
      await readFile(abs);
      existing.push(abs);
    } catch {
      // Part may not ship all three browser files.
    }
  }
  return existing;
}

function rewriteJsImports(content: string, sourceAbs: string, byAbs: Map<string, AssetFile>): string {
  return content.replace(JS_IMPORT_RE, (match, _quote: string, specifier: string) => {
    const targetAbs = resolve(dirname(sourceAbs), specifier);
    const target = byAbs.get(targetAbs);
    if (!target) return match;
    const relDir = relative(dirname(sourceAbs), dirname(targetAbs)).replaceAll('\\', '/');
    const rewritten =
      relDir === '' || relDir === '.'
        ? `./${target.hashedName}`
        : `${relDir}/${target.hashedName}`;
    return match.replace(specifier, rewritten);
  });
}

async function main(): Promise<void> {
  const outDir = parseArgs();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const sourcePaths = await discoverAssets();
  const assets: AssetFile[] = [];

  for (const absPath of sourcePaths) {
    const content = await readFile(absPath);
    const hash = contentHash(content);
    const name = basename(absPath);
    const hashedName = hashedFilename(name, hash);
    const logicalPath = logicalPathFromAbs(absPath);
    const outRelPath = outRelPathFromLogical(logicalPath, hashedName);
    assets.push({ absPath, logicalPath, hash, hashedName, outRelPath });
  }

  const byAbs = new Map(assets.map((a) => [a.absPath, a]));
  const manifest: Record<string, string> = {};

  for (const asset of assets) {
    const raw = await readFile(asset.absPath);
    let body: string | Buffer = raw;
    if (asset.absPath.endsWith('.js')) {
      body = rewriteJsImports(raw.toString('utf8'), asset.absPath, byAbs);
    }

    const dest = join(outDir, asset.outRelPath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, body);

    manifest[asset.logicalPath] = `/${asset.outRelPath.replaceAll('\\', '/')}`;
  }

  await writeFile(join(outDir, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Prepared ${assets.length} assets in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
