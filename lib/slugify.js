/**
 * URL-safe slug generator.
 * Matches behaviour of scripts/lib/slugify.mjs so filenames and URLs
 * stay consistent between the CMS-side and the build-side.
 */
export function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
