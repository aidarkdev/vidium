import type { WorkerRuntimeDependencies } from './worker-types.ts';
import { enqueueAutoDownloadsFor, enqueueThumbsFor } from './worker-jobs.ts';

const RSS_CHANNEL_DELAY_MS = 1500;

export async function pollRss(
  dependencies: WorkerRuntimeDependencies,
  shouldStop: () => boolean,
): Promise<void> {
  const channels = dependencies.getRssChannels();
  for (let index = 0; index < channels.length; index++) {
    if (shouldStop()) break;
    const channel = channels[index];
    try {
      const entries = await dependencies.fetchFeed(channel.youtubeChannelId);
      const insertedYoutubeIds = dependencies.insertVideos(entries, channel.id, 'channel');
      enqueueThumbsFor(dependencies, insertedYoutubeIds);
      enqueueAutoDownloadsFor(dependencies, insertedYoutubeIds, channel);
      dependencies.updateLastCrawled(channel.id);
    } catch (err) {
      dependencies.error(`RSS poll failed for channel ${channel.id}:`, err);
    }
    if (!shouldStop() && index < channels.length - 1) {
      await dependencies.sleep(RSS_CHANNEL_DELAY_MS);
    }
  }
}
