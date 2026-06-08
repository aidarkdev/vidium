/**
 * disk-status.ts — reads media filesystem usage for admin UI.
 */

import { statfsSync } from 'node:fs';
import { config } from '../config.ts';

type DiskStatusState = 'free' | 'busy' | 'invalid';

export interface DiskStatus {
  state: DiskStatusState;
  usedBytes: number;
  freeBytes: number;
  totalBytes: number;
  usagePercent: number;
  cleanupPercent: number;
  error: string;
}

export function getDiskUsageRatio(): number | undefined {
  const stats = statfsSync(config.MEDIA_DIR);
  const totalBytes = stats.blocks * stats.bsize;
  const freeBytes = stats.bavail * stats.bsize;

  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || freeBytes < 0) {
    return undefined;
  }

  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return usedBytes / totalBytes;
}

function invalid(error: string): DiskStatus {
  return {
    state: 'invalid',
    usedBytes: 0,
    freeBytes: 0,
    totalBytes: 0,
    usagePercent: 0,
    cleanupPercent: Math.round(config.DISK_HIGH_WATERMARK * 1000) / 10,
    error,
  };
}

export function readDiskStatus(): DiskStatus {
  try {
    const stats = statfsSync(config.MEDIA_DIR);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usage = getDiskUsageRatio();

    if (usage === undefined) {
      return invalid('disk stats are invalid');
    }

    const usedBytes = Math.max(0, totalBytes - freeBytes);

    return {
      state: usage >= config.DISK_HIGH_WATERMARK ? 'busy' : 'free',
      usedBytes,
      freeBytes,
      totalBytes,
      usagePercent: Math.round(usage * 1000) / 10,
      cleanupPercent: Math.round(config.DISK_HIGH_WATERMARK * 1000) / 10,
      error: '',
    };
  } catch (err) {
    return invalid(err instanceof Error ? err.message : String(err));
  }
}
