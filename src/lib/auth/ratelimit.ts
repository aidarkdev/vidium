/**
 * ratelimit.ts — in-memory rate limiter for login attempts.
 * Tracks by IP and by login: 5 attempts per 15 minutes each.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

function purgeStale(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

setInterval(purgeStale, 60_000);

function check(key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) return false;

  entry.count++;
  return true;
}

function reset(key: string): void {
  store.delete(key);
}

export function checkLoginRateLimit(ip: string, login: string): boolean {
  return check(`ip:${ip}`) && check(`login:${login}`);
}

export function resetLoginRateLimit(ip: string, login: string): void {
  reset(`ip:${ip}`);
  reset(`login:${login}`);
}
