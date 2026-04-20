/**
 * auth-form.ts — login and register page HTML.
 */

import { page } from './page.ts';
import { esc } from './esc.ts';
import { t } from './lang.ts';

export function renderLoginPage(lang: string, error?: string): string {
  const errorHtml = error ? `<p class="form-error">${esc(t(lang, error))}</p>` : '';

  const body = `<div class="auth-form">
  <h1>${t(lang, 'auth.login')}</h1>
  ${errorHtml}
  <form method="post" action="/login">
    <label>${t(lang, 'auth.field.login')}<input type="text" name="login" autocomplete="username" required></label>
    <label>${t(lang, 'auth.field.password')}<input type="password" name="password" autocomplete="current-password" required></label>
    <button type="submit">${t(lang, 'auth.login')}</button>
  </form>
  <p><a href="/register">${t(lang, 'auth.register')}</a></p>
</div>`;

  return page({ title: t(lang, 'auth.login.title'), lang, body });
}

export function renderRegisterPage(lang: string, error?: string): string {
  const errorHtml = error ? `<p class="form-error">${esc(t(lang, error))}</p>` : '';

  const body = `<div class="auth-form">
  <h1>${t(lang, 'auth.register')}</h1>
  ${errorHtml}
  <form method="post" action="/register">
    <label>${t(lang, 'auth.field.invite')}<input type="text" name="invite" required></label>
    <label>${t(lang, 'auth.field.login')}<input type="text" name="login" autocomplete="username" required></label>
    <label>${t(lang, 'auth.field.password')}<input type="password" name="password" autocomplete="new-password" required></label>
    <button type="submit">${t(lang, 'auth.register')}</button>
  </form>
  <p><a href="/login">${t(lang, 'auth.login')}</a></p>
</div>`;

  return page({ title: t(lang, 'auth.register.title'), lang, body });
}
