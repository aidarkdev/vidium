/**
 * auth-form.ts — login and register page HTML.
 */

import { page } from './page.ts';
import { esc } from './esc.ts';
import { t } from './lang.ts';

export function renderLoginPage(lang: string, error?: string): string {
  const title = t(lang, 'auth.login.title');
  const heading = t(lang, 'auth.login');
  const errorHtml = error ? `<p class="form-error">${esc(t(lang, error))}</p>` : '';
  const loginLabel = t(lang, 'auth.field.login');
  const passwordLabel = t(lang, 'auth.field.password');
  const submitLabel = t(lang, 'auth.login');
  const registerLabel = t(lang, 'auth.register');

  const body = `<div class="auth-form">
  <h1>${heading}</h1>
  ${errorHtml}
  <form method="post" action="/login">
    <label>${loginLabel}<input type="text" name="login" autocomplete="username" required></label>
    <label>${passwordLabel}<input type="password" name="password" autocomplete="current-password" required></label>
    <button type="submit">${submitLabel}</button>
  </form>
  <p><a href="/register">${registerLabel}</a></p>
</div>`;

  return page({ title, lang, body });
}

export function renderRegisterPage(lang: string, error?: string): string {
  const title = t(lang, 'auth.register.title');
  const heading = t(lang, 'auth.register');
  const errorHtml = error ? `<p class="form-error">${esc(t(lang, error))}</p>` : '';
  const inviteLabel = t(lang, 'auth.field.invite');
  const loginLabel = t(lang, 'auth.field.login');
  const passwordLabel = t(lang, 'auth.field.password');
  const submitLabel = t(lang, 'auth.register');
  const loginLink = t(lang, 'auth.login');

  const body = `<div class="auth-form">
  <h1>${heading}</h1>
  ${errorHtml}
  <form method="post" action="/register">
    <label>${inviteLabel}<input type="text" name="invite" required></label>
    <label>${loginLabel}<input type="text" name="login" autocomplete="username" required></label>
    <label>${passwordLabel}<input type="password" name="password" autocomplete="new-password" required></label>
    <button type="submit">${submitLabel}</button>
  </form>
  <p><a href="/login">${loginLink}</a></p>
</div>`;

  return page({ title, lang, body });
}
