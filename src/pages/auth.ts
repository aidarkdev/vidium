/**
 * auth.ts — login and register page-part assembly.
 */

import { bakeLoginPage, bakeRegisterPage } from '../parts/auth-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

export function renderLoginPage(lang: string, error?: string): string {
  const page = bakeLoginPage(lang, error);

  return renderPartPage({
    lang,
    isAdmin: false,
    baked: { [page.id]: page.state },
    body: mountScript('/parts/auth-page/index.js', page.id),
  });
}

export function renderRegisterPage(lang: string, error?: string): string {
  const page = bakeRegisterPage(lang, error);

  return renderPartPage({
    lang,
    isAdmin: false,
    baked: { [page.id]: page.state },
    body: mountScript('/parts/auth-page/index.js', page.id),
  });
}
