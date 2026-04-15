#!/usr/bin/env node
/**
 * Scalderhurst blog build.
 *
 * Pipeline:
 *   1. Load posts from /content/posts/*.md (gray-matter frontmatter + body)
 *   2. Validate required fields (fail loud)
 *   3. For each post:
 *        - process cover image → /assets/images/news/<slug>/cover-*.{webp,jpg}
 *        - render markdown body → sanitised HTML
 *        - render post page → /news/<slug>/index.html
 *   4. Render /news/index.html (archive grouped by category)
 *   5. Rewrite /sitemap.xml
 *   6. Write /news/feed.xml and /news/feed.json
 *
 * Idempotent. Images are hash-cached (scripts/.cache/images.json) so unchanged
 * covers aren't reprocessed on every deploy.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPosts, groupByCategory, relatedPosts } from './lib/posts.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { getImageCache, writeImageCache, processCover } from './lib/images.mjs';
import { postPage, archivePage } from './lib/templates.mjs';
import { writeSitemap } from './lib/sitemap.mjs';
import { writeFeeds } from './lib/feeds.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SITE_ROOT = resolve(__dirname, '..');
const CONTENT_DIR = join(SITE_ROOT, 'content');
const NEWS_DIR = join(SITE_ROOT, 'news');
const CACHE_PATH = join(SITE_ROOT, 'scripts', '.cache', 'images.json');

function log(msg) {
  console.log(`[build] ${msg}`);
}

async function main() {
  const startedAt = Date.now();
  log('loading posts…');
  const posts = await loadPosts(CONTENT_DIR);
  log(`loaded ${posts.length} published post${posts.length === 1 ? '' : 's'}`);

  // Image processing — cached by source hash
  const imageCache = await getImageCache(CACHE_PATH);
  const processed = { count: 0 };
  const imagesByPost = new Map();

  for (const post of posts) {
    const images = await processCover(post, {
      siteRoot: SITE_ROOT,
      cache: imageCache,
      processed,
    });
    imagesByPost.set(post.slug, images);
  }

  if (posts.length) {
    log(`processed ${processed.count} image renditions (remaining cached)`);
  }

  await writeImageCache(CACHE_PATH, imageCache);

  // Render body HTML for each post (used by post page AND feeds)
  for (const post of posts) {
    post.bodyHtml = renderMarkdown(post.body);
  }

  // Write post pages
  await mkdir(NEWS_DIR, { recursive: true });
  for (const post of posts) {
    const related = relatedPosts(post, posts, 3);
    const images = imagesByPost.get(post.slug);
    const html = postPage(post, images, related, imagesByPost);
    const outDir = join(NEWS_DIR, post.slug);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'index.html'), html, 'utf-8');
  }

  // Archive
  const grouped = groupByCategory(posts);
  const archiveHtml = archivePage(grouped, imagesByPost);
  await writeFile(join(NEWS_DIR, 'index.html'), archiveHtml, 'utf-8');

  // Sitemap
  await writeSitemap(posts, SITE_ROOT);

  // Feeds (RSS + JSON)
  await writeFeeds(posts, imagesByPost, SITE_ROOT);

  const ms = Date.now() - startedAt;
  log(`done in ${ms} ms: ${posts.length} post page${posts.length === 1 ? '' : 's'}, 1 archive, sitemap + feeds`);
}

main().catch(err => {
  console.error('\n[build] FAILED');
  console.error(err.message || err);
  if (err.stack && process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
