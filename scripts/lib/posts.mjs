/**
 * Load, validate and sort blog posts from /content/posts/*.md.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

import { slugify } from './slugify.mjs';
import { markdownToPlainText } from './markdown.mjs';

export const CATEGORIES = {
  'company-updates':   { slug: 'company-updates',   label: 'Company Updates',   anchor: 'updates-heading' },
  'industry-insights': { slug: 'industry-insights', label: 'Industry Insights', anchor: 'insights-heading' },
  'stock-offers':      { slug: 'stock-offers',      label: 'Stock & Offers',    anchor: 'offers-heading' },
};

const CATEGORY_ORDER = ['stock-offers', 'company-updates', 'industry-insights'];

const REQUIRED_FIELDS = ['title', 'category', 'date', 'cover', 'cover_alt'];

/**
 * Truncate text at the nearest word boundary below maxLen.
 * Appends a horizontal ellipsis if truncation occurred.
 */
function truncateAtWord(text, maxLen = 155) {
  if (!text || text.length <= maxLen) return text || '';
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[,.;:!?\-–—\s]+$/, '') + '…';
}

/**
 * Load and validate all posts.
 * Returns an array of normalised post objects, sorted newest-first.
 *
 * Throws with a useful error message if any required field is missing.
 */
export async function loadPosts(contentDir) {
  const postsDir = join(contentDir, 'posts');

  let entries;
  try {
    entries = await readdir(postsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const mdFiles = entries.filter(name => name.endsWith('.md') && !name.startsWith('.'));
  const now = new Date();
  const errors = [];
  const posts = [];

  for (const filename of mdFiles) {
    const filepath = join(postsDir, filename);
    const raw = await readFile(filepath, 'utf-8');
    const parsed = matter(raw);
    const fm = parsed.data || {};
    const body = parsed.content || '';

    // Validate required fields
    const missing = REQUIRED_FIELDS.filter(f => !fm[f]);
    if (missing.length) {
      errors.push(`  ${filename}: missing required field(s): ${missing.join(', ')}`);
      continue;
    }

    // Skip drafts
    if (fm.draft === true) continue;

    // Parse and validate date
    const dateObj = fm.date instanceof Date ? fm.date : new Date(fm.date);
    if (isNaN(dateObj.getTime())) {
      errors.push(`  ${filename}: invalid date "${fm.date}"`);
      continue;
    }

    // Skip future-dated posts
    if (dateObj > now) continue;

    // Resolve category
    const categoryValue = String(fm.category).trim();
    const category = CATEGORIES[categoryValue];
    if (!category) {
      errors.push(`  ${filename}: unknown category "${categoryValue}" (valid: ${Object.keys(CATEGORIES).join(', ')})`);
      continue;
    }

    // Derive slug
    const slug = String(fm.slug || slugify(fm.title));
    if (!slug) {
      errors.push(`  ${filename}: could not derive a slug`);
      continue;
    }

    // Derive excerpt
    const plainText = markdownToPlainText(body);
    const excerpt = fm.excerpt ? String(fm.excerpt).trim() : truncateAtWord(plainText, 155);

    // Reading time
    const rt = readingTime(plainText, { wordsPerMinute: 220 });
    const minutes = Math.max(1, Math.round(rt.minutes));
    const wordCount = rt.words;

    // Last-modified date (fallback for schema)
    const fileStat = await stat(filepath);
    const modifiedDate = fm.updated instanceof Date
      ? fm.updated
      : fm.updated
        ? new Date(fm.updated)
        : fileStat.mtime;

    posts.push({
      filename,
      filepath,
      slug,
      title: String(fm.title).trim(),
      category,
      date: dateObj,
      modifiedDate,
      excerpt,
      cover: String(fm.cover).trim(),
      coverAlt: String(fm.cover_alt).trim(),
      tags: Array.isArray(fm.tags) ? fm.tags.map(t => String(t).trim()).filter(Boolean) : [],
      body,
      plainText,
      wordCount,
      readingMinutes: minutes,
    });
  }

  if (errors.length) {
    const msg = 'Post validation failed:\n' + errors.join('\n');
    throw new Error(msg);
  }

  // Sort newest first
  posts.sort((a, b) => b.date - a.date);

  return posts;
}

/**
 * Group published posts by category in the canonical UI order.
 */
export function groupByCategory(posts) {
  const groups = {};
  for (const key of CATEGORY_ORDER) {
    groups[key] = {
      category: CATEGORIES[key],
      posts: [],
    };
  }
  for (const post of posts) {
    groups[post.category.slug].posts.push(post);
  }
  return CATEGORY_ORDER.map(key => groups[key]);
}

/**
 * For a given post, return up to `limit` related posts.
 * Same category first, then fall back to latest across all categories.
 */
export function relatedPosts(post, allPosts, limit = 3) {
  const others = allPosts.filter(p => p.slug !== post.slug);
  const sameCategory = others.filter(p => p.category.slug === post.category.slug);
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);
  const rest = others.filter(p => p.category.slug !== post.category.slug);
  return [...sameCategory, ...rest].slice(0, limit);
}
