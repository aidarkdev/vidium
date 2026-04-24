export interface AuthFormBodyOptions {
  heading: string;
  errorHtml: string;
  action: '/login' | '/register';
  fieldsHtml: string;
  linkHref: '/login' | '/register';
  linkLabel: string;
  submitLabel: string;
}

export function renderAuthFormBody(opts: AuthFormBodyOptions): string {
  return `<div class="auth-form">
    <h1>${opts.heading}</h1>
    ${opts.errorHtml}
    <form method="post" action="${opts.action}">
      ${opts.fieldsHtml}
      <button type="submit">${opts.submitLabel}</button>
    </form>
    <p><a href="${opts.linkHref}">${opts.linkLabel}</a></p>
  </div>`;
}
