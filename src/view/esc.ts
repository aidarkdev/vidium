/**
 * esc.ts — escapes a string for safe inclusion in HTML.
 * Covers the 5 characters that can break HTML context.
 */

export function esc(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
