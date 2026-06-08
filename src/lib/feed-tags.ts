/** Virtual feed filters — not rows in the tags table. */

export const FEED_TAG_ALL = 'all';
export const FEED_TAG_READY = 'ready';
export const FEED_TAG_MANUAL = 'manual';

const SYSTEM_FEED_TAGS = new Set([FEED_TAG_ALL, FEED_TAG_READY, FEED_TAG_MANUAL]);
const GUEST_RESTRICTED_FEED_TAGS = new Set([FEED_TAG_READY, FEED_TAG_MANUAL]);

export function isSystemFeedTag(tag: string): boolean {
  return SYSTEM_FEED_TAGS.has(tag);
}

export function isCustomFeedTag(tag: string): boolean {
  return tag !== '' && !isSystemFeedTag(tag);
}

export function isGuestRestrictedFeedTag(tag: string): boolean {
  return GUEST_RESTRICTED_FEED_TAGS.has(tag);
}

/** Map guest-inaccessible system tags to the public home feed. */
export function normalizeGuestFeedTag(tag: string): string {
  return isGuestRestrictedFeedTag(tag) ? FEED_TAG_ALL : tag;
}
