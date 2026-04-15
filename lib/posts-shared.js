/**
 * Shared validation helpers used by the posts API.
 * Keeps the API endpoints thin and consistent.
 */
import matter from 'gray-matter';
import { slugify } from './slugify.js';
import { getFile, listDirectory } from './github.js';

export const CATEGORIES = new Set(['stock-offers', 'company-updates', 'industry-insights']);

const ALLOWED_FRONTMATTER_FIELDS = new Set([
  'title', 'slug', 'category', 'date', 'draft',
  'excerpt', 'cover', 'cover_alt', 'tags', 'updated',
]);

/**
 * Build a safe filename from a date + slug. Used for new posts.
 * Format: YYYY-MM-DD-slug.md
 */
export function filenameFor(date, slug) {
  const d = new Date(date);
  if (isNaN(d.getTime())) throw new Error('Invalid date');
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${slug}.md`;
}

/**
 * Only allow safe filenames — prevents path-traversal on reads/writes.
 * Must be YYYY-MM-DD-slug.md style: letters, digits, dashes, .md suffix.
 */
export function isSafeFilename(name) {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9-]*\.md$/i.test(name);
}

/**
 * Validate and normalise form input from the admin UI.
 * Returns { ok: true, frontmatter, body, slug, filename }
 *      or { ok: false, error }.
 *
 * `mode` is 'create' or 'update'. For 'update' we need an existing filename
 * so the caller can preserve it (date change should not change filename).
 */
export function buildPostFile(input, { mode = 'create', existingFilename = null } = {}) {
  const {
    title, slug: slugInput, category, date, draft,
    excerpt, cover, cover_alt, tags, body: bodyInput, updated,
  } = input || {};

  if (!title || !String(title).trim()) return { ok: false, error: 'Title is required' };
  if (!category || !CATEGORIES.has(category)) {
    return { ok: false, error: 'Category must be one of: stock-offers, company-updates, industry-insights' };
  }
  if (!date) return { ok: false, error: 'Publish date is required' };
  if (isNaN(new Date(date).getTime())) return { ok: false, error: 'Invalid date' };
  if (!cover || !String(cover).trim()) return { ok: false, error: 'Cover image is required' };
  if (!cover_alt || !String(cover_alt).trim()) return { ok: false, error: 'Cover alt text is required' };

  const slug = slugify(slugInput || title);
  if (!slug) return { ok: false, error: 'Could not derive a URL slug' };

  const fm = {
    title: String(title).trim(),
    slug,
    category,
    date: new Date(date).toISOString(),
    draft: draft === true,
  };
  if (excerpt && String(excerpt).trim()) fm.excerpt = String(excerpt).trim();
  fm.cover = String(cover).trim();
  fm.cover_alt = String(cover_alt).trim();
  if (Array.isArray(tags)) {
    const cleaned = tags.map((t) => String(t).trim()).filter(Boolean);
    if (cleaned.length) fm.tags = cleaned;
  }
  if (mode === 'update') {
    fm.updated = new Date().toISOString();
  } else if (updated) {
    fm.updated = new Date(updated).toISOString();
  }

  // Strip any unexpected keys — defence in depth
  for (const k of Object.keys(fm)) {
    if (!ALLOWED_FRONTMATTER_FIELDS.has(k)) delete fm[k];
  }

  const body = typeof bodyInput === 'string' ? bodyInput : '';
  const fileContent = matter.stringify(body, fm);

  const filename = mode === 'update' && existingFilename
    ? existingFilename
    : filenameFor(fm.date, slug);

  return { ok: true, frontmatter: fm, body, slug, filename, fileContent };
}

/**
 * Returns the filename of another post that has the same frontmatter slug,
 * or null if none. Used to reject collisions — two posts at the same URL
 * (/news/<slug>/) would clobber each other at build time.
 *
 * Pass `excludeFilename` when updating so we don't match against the post
 * currently being saved.
 */
export async function findSlugCollision(slug, excludeFilename = null) {
  if (!slug) return null;
  const entries = await listDirectory('content/posts');
  const candidates = entries.filter(
    (e) => e.type === 'file' && e.name.endsWith('.md') && e.name !== excludeFilename
  );
  if (!candidates.length) return null;

  const results = await Promise.all(
    candidates.map(async (c) => {
      try {
        const file = await getFile(`content/posts/${c.name}`);
        if (!file) return null;
        const parsed = matter(file.content);
        const existingSlug = String((parsed.data && parsed.data.slug) || '').trim();
        return existingSlug === slug ? c.name : null;
      } catch {
        return null;
      }
    })
  );
  return results.find(Boolean) || null;
}

