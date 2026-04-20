/**
 * handlers/auth.ts — GET/POST /login, GET/POST /register, POST /logout, GET /lang/:code
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseCookies } from '../lib/auth/cookies.ts';
import { setCookie, clearCookie } from '../lib/auth/cookies.ts';
import {
  createSession,
  getSession,
  destroySession,
  updateSessionData,
} from '../lib/auth/sessions.ts';
import { checkLoginRateLimit, resetLoginRateLimit } from '../lib/auth/ratelimit.ts';
import { authenticate, register, checkInviteCode } from '../lib/auth/auth.ts';
import { renderLoginPage, renderRegisterPage } from '../view/auth-form.ts';
import { redirect, html, readBody, parseForm } from '../lib/http.ts';
import { config } from '../config.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLang(req: IncomingMessage): string {
  return parseCookies(req).lang ?? config.DEFAULT_LANG;
}

function getIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const lang = getLang(req);

  if (req.method === 'GET') {
    const cookies = parseCookies(req);
    if (cookies.sid && getSession(cookies.sid)) return redirect(res, '/');
    return html(res, renderLoginPage(lang));
  }

  const body = await readBody(req);
  const form = parseForm(body);
  const login = form.login ?? '';
  const password = form.password ?? '';
  const ip = getIp(req);

  if (!checkLoginRateLimit(ip, login)) {
    return html(res, renderLoginPage(lang, 'auth.error.ratelimit'));
  }

  const user = await authenticate(login, password);
  if (!user) {
    return html(res, renderLoginPage(lang, 'auth.error.invalid'));
  }

  resetLoginRateLimit(ip, login);
  const sid = createSession(user.id, { lang });
  setCookie(res, 'sid', sid, config.SESSION_MAX_AGE);
  redirect(res, '/');
}

export async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const lang = getLang(req);

  if (req.method === 'GET') {
    return html(res, renderRegisterPage(lang));
  }

  const body = await readBody(req);
  const form = parseForm(body);
  const invite = form.invite ?? '';
  const login = form.login ?? '';
  const password = form.password ?? '';

  if (!checkInviteCode(invite)) {
    return html(res, renderRegisterPage(lang, 'auth.error.invite'));
  }

  try {
    const user = await register(login, password);
    const sid = createSession(user.id, { lang });
    setCookie(res, 'sid', sid, config.SESSION_MAX_AGE);
    redirect(res, '/');
  } catch {
    return html(res, renderRegisterPage(lang, 'auth.error.taken'));
  }
}

export function handleLang(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const cookies = parseCookies(req);
  const session = cookies.sid ? getSession(cookies.sid) : undefined;
  const lang = params.code === 'ru' ? 'ru' : 'en';

  if (session) {
    updateSessionData(session.sid, { ...session.data, lang });
  }

  const ref = (req.headers.referer as string | undefined) ?? '';
  const dest = ref.startsWith('/') && !ref.startsWith('//') ? ref : '/feed';
  redirect(res, dest);
}

export function handleLogout(req: IncomingMessage, res: ServerResponse): void {
  const cookies = parseCookies(req);
  if (cookies.sid) destroySession(cookies.sid);
  clearCookie(res, 'sid');
  redirect(res, '/login');
}
