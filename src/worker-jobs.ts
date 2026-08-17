import type { WorkerRuntimeDependencies } from './worker-types.ts';

export function enqueueThumbsFor(
  dependencies: WorkerRuntimeDependencies,
  youtubeIds: string[],
): void {
  for (const youtubeId of youtubeIds) {
    dependencies.enqueue('download_thumbnail', { youtubeId });
  }
}

export function enqueueAutoDownloadsFor(
  dependencies: WorkerRuntimeDependencies,
  youtubeIds: string[],
  settings: { autoDownloadVideo: boolean; autoDownloadAudio: boolean },
): void {
  for (const youtubeId of youtubeIds) {
    if (settings.autoDownloadVideo) {
      dependencies.setVideoStatus(youtubeId, 'queued');
      dependencies.enqueue('download_video', { youtubeId });
    }
    if (settings.autoDownloadAudio) {
      dependencies.setAudioStatus(youtubeId, 'queued');
      dependencies.enqueue('download_audio', { youtubeId });
    }
  }
}

async function refreshChaptersFor(
  dependencies: WorkerRuntimeDependencies,
  youtubeId: string,
): Promise<void> {
  try {
    dependencies.setVideoChapters(youtubeId, await dependencies.fetchChapters(youtubeId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dependencies.error(`chapter fetch failed for ${youtubeId}:`, msg);
  }
}

export async function processWorkerJob(
  dependencies: WorkerRuntimeDependencies,
  type: string,
  payload: string,
): Promise<void> {
  const data = JSON.parse(payload);

  switch (type) {
    case 'download_video': {
      dependencies.setVideoStatus(data.youtubeId, 'downloading');
      try {
        const duration = await dependencies.downloadVideo(
          data.youtubeId,
          `${dependencies.mediaDir}/videos`,
        );
        dependencies.setVideoStatus(data.youtubeId, 'ready');
        if (duration > 0) dependencies.setDurationIfZero(data.youtubeId, duration);
        await refreshChaptersFor(dependencies, data.youtubeId);
      } catch (err) {
        dependencies.setVideoStatus(data.youtubeId, 'none');
        throw err;
      }
      break;
    }

    case 'download_audio': {
      dependencies.setAudioStatus(data.youtubeId, 'downloading');
      try {
        const duration = await dependencies.downloadAudio(
          data.youtubeId,
          `${dependencies.mediaDir}/audio`,
        );
        dependencies.setAudioStatus(data.youtubeId, 'ready');
        if (duration > 0) dependencies.setDurationIfZero(data.youtubeId, duration);
        await refreshChaptersFor(dependencies, data.youtubeId);
      } catch (err) {
        dependencies.setAudioStatus(data.youtubeId, 'none');
        throw err;
      }
      break;
    }

    case 'crawl_channel': {
      const result = await dependencies.crawlChannel(data.url, 1, dependencies.crawlInitial);
      const insertedYoutubeIds = dependencies.insertVideos(
        result.entries,
        data.channelId,
        'channel',
      );
      enqueueThumbsFor(dependencies, insertedYoutubeIds);
      const channel = dependencies.getChannelById(data.channelId);
      if (channel) enqueueAutoDownloadsFor(dependencies, insertedYoutubeIds, channel);
      if (result.channelYoutubeId) {
        dependencies.updateChannelYoutubeId(data.channelId, result.channelYoutubeId);
      }
      break;
    }

    case 'download_thumbnail': {
      const destDir = `${dependencies.mediaDir}/thumbs`;
      if (!dependencies.existsSync(`${destDir}/${data.youtubeId}.jpg`)) {
        await dependencies.downloadThumb(data.youtubeId, destDir);
      }
      break;
    }
  }
}
