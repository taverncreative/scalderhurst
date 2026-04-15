/**
 * Cover image processing pipeline.
 *
 * Given a path inside the repo (e.g. "/content/uploads/2026/04/warehouse.jpg"),
 * produce a set of web-optimised renditions under /assets/images/news/<slug>/:
 *
 *   cover-640.webp   — small thumbnail srcset candidate
 *   cover-1024.webp  — medium srcset candidate
 *   cover-1600.webp  — large srcset candidate (hero background)
 *   cover-1200.jpg   — OG image (1200x630, social previews)
 *
 * Caches by source hash so unchanged files aren't reprocessed on every build.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const TARGETS = [
  { width: 640,  format: 'webp', file: 'cover-640.webp'  },
  { width: 1024, format: 'webp', file: 'cover-1024.webp' },
  { width: 1600, format: 'webp', file: 'cover-1600.webp' },
];

const OG_TARGET = {
  width: 1200,
  height: 630,
  format: 'jpeg',
  file: 'cover-1200.jpg',
};

async function fileHash(path) {
  const data = await readFile(path);
  return createHash('sha1').update(data).digest('hex');
}

async function loadCache(cachePath) {
  try {
    const raw = await readFile(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveCache(cachePath, cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

function resolveSource(coverPath, siteRoot) {
  // Covers are stored relative to site root, e.g. "/content/uploads/2026/04/file.jpg"
  // Strip leading slash and resolve against site root.
  const normalised = coverPath.startsWith('/') ? coverPath.slice(1) : coverPath;
  return resolve(siteRoot, normalised);
}

/**
 * Process a single cover image for a post.
 * Returns a descriptor with public URLs for each rendition.
 */
export async function processCover(post, { siteRoot, cache, processed }) {
  const src = resolveSource(post.cover, siteRoot);

  // Ensure source exists with a helpful error
  try {
    await stat(src);
  } catch {
    throw new Error(`Cover image not found for post "${post.filename}": ${post.cover}`);
  }

  const outDir = join(siteRoot, 'assets', 'images', 'news', post.slug);
  await mkdir(outDir, { recursive: true });

  const hash = await fileHash(src);
  const cacheKey = `${post.slug}:${hash}`;
  const cached = cache[cacheKey];

  const urls = {
    webp640:  `/assets/images/news/${post.slug}/cover-640.webp`,
    webp1024: `/assets/images/news/${post.slug}/cover-1024.webp`,
    webp1600: `/assets/images/news/${post.slug}/cover-1600.webp`,
    jpg1200:  `/assets/images/news/${post.slug}/cover-1200.jpg`,
  };

  if (cached && cached.done) {
    return { ...urls, cached: true };
  }

  // Re-generate all renditions (source unchanged guarantee is via hash)
  for (const target of TARGETS) {
    const outPath = join(outDir, target.file);
    await sharp(src)
      .rotate()               // respect EXIF orientation
      .resize({ width: target.width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outPath);
    processed.count++;
  }

  // OG image — 1200x630, cover-fit, JPEG
  const ogPath = join(outDir, OG_TARGET.file);
  await sharp(src)
    .rotate()
    .resize({
      width: OG_TARGET.width,
      height: OG_TARGET.height,
      fit: 'cover',
      position: 'attention',
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(ogPath);
  processed.count++;

  cache[cacheKey] = { done: true, at: Date.now() };

  return { ...urls, cached: false };
}

export async function getImageCache(cachePath) {
  return loadCache(cachePath);
}

export async function writeImageCache(cachePath, cache) {
  return saveCache(cachePath, cache);
}
