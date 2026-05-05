import { t } from '../../pages/lang.ts';

export function bakeLoginPage(lang: string, error?: string): { id: string; title: string; state: Record<string, unknown> } {
  return {
    id: 'login-page',
    title: t(lang, 'auth.login.title'),
    state: {
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
  };
}

export function bakeRegisterPage(lang: string, error?: string): { id: string; title: string; state: Record<string, unknown> } {
  return {
    id: 'register-page',
    title: t(lang, 'auth.register.title'),
    state: {
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
  };
}
