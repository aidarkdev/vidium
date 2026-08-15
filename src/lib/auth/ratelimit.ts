/**
 * ratelimit.ts — in-memory rate limiters for authentication endpoints.
 * Login failures and registration attempts are tracked by trusted client IP.
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

function consume(key: string): boolean {
  const now = Date.now();
  purgeStale();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) return false;

  entry.count++;
  return true;
}

function isLimited(key: string): boolean {
  purgeStale();
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    store.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function isLoginRateLimited(ip: string): boolean {
  return isLimited(`login:${ip}`);
}

export function recordLoginFailure(ip: string): void {
  consume(`login:${ip}`);
}

export function resetLoginRateLimit(ip: string): void {
  store.delete(`login:${ip}`);
}

export function checkRegistrationRateLimit(ip: string): boolean {
  return consume(`register:${ip}`);
}
