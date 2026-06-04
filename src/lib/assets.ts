import { readFileSync } from 'node:fs';

let manifest: Record<string, string> | null = null;

export function loadAssetManifest(manifestPath: string): void {
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as Record<string, string>;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      manifest = null;
      return;
    }
    throw err;
  }
}

export function assetUrl(logical: string): string {
  return manifest?.[logical] ?? logical;
}
