/**
 * URL-safe slug generator.
 * Lowercase, ASCII only, dashes instead of spaces, no consecutive dashes,
 * no leading/trailing dashes.
 */
export function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')       // strip accents
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
