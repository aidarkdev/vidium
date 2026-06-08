import {
  getChannelById,
  getGuestVisibleChannels,
  getGuestVisibleTags,
  type Channel,
  type TagLabel,
} from './channel.ts';
import { getVideoByUid, type VideoRow } from './video.ts';

export type MediaKind = 'video' | 'audio';
export type ViewerMode = 'user' | 'guest';

export function getGuestChannels(): Channel[] {
  return getGuestVisibleChannels();
}

export function getGuestTags(): TagLabel[] {
  return getGuestVisibleTags();
}

export function getGuestChannelIds(): Set<number> {
  return new Set(getGuestChannels().map((channel) => channel.id));
}

export function isGuestVisibleChannel(channelId: number): boolean {
  const channel = getChannelById(channelId);
  return channel?.guestVisible === true;
}

export function getGuestVisibleVideo(uid: string): VideoRow | undefined {
  const video = getVideoByUid(uid);
  if (!video || !isGuestVisibleChannel(video.channelId)) return undefined;
  return video;
}

export function canGuestAccessVideo(uid: string, kind: MediaKind): boolean {
  const video = getGuestVisibleVideo(uid);
  if (!video) return false;
  return kind === 'video' ? video.videoStatus === 'ready' : video.audioStatus === 'ready';
}
