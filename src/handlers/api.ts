/** Compatibility facade for the split JSON API handlers. */

export { handleSidebarMode, handleStatus, handleSince, handleFeedCards } from './api-feed.ts';
export { handleDownload, handlePlay } from './api-media.ts';
export {
  handleAddChannel,
  handleAddVideo,
  handleSetChannelDisplayName,
  handleSetChannelTags,
  handleSetChannelAutoDownload,
  handleSetChannelGuestVisible,
  handleSetChannelRssEnabled,
  handleReorderChannel,
  handleReorderTag,
  handleDeleteTag,
  handleAdminDeleteVideoFiles,
  handleAdminDeleteVideo,
  handleAdminDeleteJob,
  handleAdminResetVideoStatus,
  handleAdminSetUserRole,
} from './api-admin.ts';
