/**
 * auth.ts — login and register page-part assembly.
 */

import { t } from './lang.ts';
import { mountScript, renderPartPage } from './part-page.ts';

export function renderLoginPage(lang: string, error?: string): string {
  const id = 'login-page';
  return renderPartPage({
    lang,
    title: t(lang, 'auth.login.title'),
    baked: {
      [id]: {
        heading: t(lang, 'auth.login'),
        error: error ? t(lang, error) : '',
        action: '/login',
        fields: [
          {
            label: t(lang, 'auth.field.login'),
            type: 'text',
            name: 'login',
            autocomplete: 'username',
          },
          {
            label: t(lang, 'auth.field.password'),
            type: 'password',
            name: 'password',
            autocomplete: 'current-password',
          },
        ],
        submitLabel: t(lang, 'auth.login'),
        linkHref: '/register',
        linkLabel: t(lang, 'auth.register'),
      },
    },
    body: mountScript('/parts/auth-page/index.js', id),
  });
}

export function renderRegisterPage(lang: string, error?: string): string {
  const id = 'register-page';
  return renderPartPage({
    lang,
    title: t(lang, 'auth.register.title'),
    baked: {
      [id]: {
        heading: t(lang, 'auth.register'),
        error: error ? t(lang, error) : '',
        action: '/register',
        fields: [
          { label: t(lang, 'auth.field.invite'), type: 'text', name: 'invite' },
          {
            label: t(lang, 'auth.field.login'),
            type: 'text',
            name: 'login',
            autocomplete: 'username',
          },
          {
            label: t(lang, 'auth.field.password'),
            type: 'password',
            name: 'password',
            autocomplete: 'new-password',
          },
        ],
        submitLabel: t(lang, 'auth.register'),
        linkHref: '/login',
        linkLabel: t(lang, 'auth.login'),
      },
    },
    body: mountScript('/parts/auth-page/index.js', id),
  });
}
