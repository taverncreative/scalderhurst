#!/usr/bin/env node
/**
 * Remove non-public files from the Vercel build container so they are never
 * part of the deployed static output.
 *
 * Why this exists: with `outputDirectory: "."`, everything left in the repo
 * root after the build is served as a static file. Vercel serves existing
 * files BEFORE evaluating rewrites, so a rewrite can never block a file that
 * exists — the only reliable way to keep a file off the CDN is for it not to
 * exist when the build finishes.
 *
 * What gets pruned (sources the site has already consumed at build time):
 *   content/.admin/   — admin password hash (read at runtime via the GitHub
 *                       Contents API, never from the deployed filesystem)
 *   content/posts/    — raw Markdown sources (rendered to /news/ by build.mjs)
 *   scripts/.cache/   — image-processing cache generated during the build
 *
 * content/uploads/ stays: post images are served from there.
 *
 * Guard: only runs when VERCEL is set (the build container) or with --force,
 * so running it locally can never delete working-tree sources.
 */
import { rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PRUNE_PATHS = [
  'content/.admin',
  'content/posts',
  'scripts/.cache',
  // Rendition sources — pages reference only /assets/images/renditions/,
  // which build.mjs generates from these before this prune runs. Originals
  // stay in git as source material. (banners/ stays deployed: og:image URLs
  // point at the originals there.)
  'assets/images/products',
  'assets/images/warehouse',
  'assets/images/industries',
  'assets/images/team',
];

const force = process.argv.includes('--force');
if (!process.env.VERCEL && !force) {
  console.log('[prune-private] not a Vercel build (and no --force) — skipping');
  process.exit(0);
}

for (const rel of PRUNE_PATHS) {
  await rm(join(SITE_ROOT, rel), { recursive: true, force: true });
  console.log(`[prune-private] removed ${rel}`);
}
