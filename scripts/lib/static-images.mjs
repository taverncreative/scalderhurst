/**
 * Responsive renditions for static-page images (the blog-cover pipeline in
 * images.mjs handles post covers; this covers everything else).
 *
 * Sources: every image in assets/images/{products,warehouse,industries,team,banners}.
 * Outputs (gitignored, regenerated per build) under assets/images/renditions/:
 *   <dir>/<stem>-{480,960,<max>}.webp   — srcset candidates (max = min(1440, source width))
 *   <dir>/<stem>-960.jpg                — <img src> fallback + og:image target
 *
 * Page HTML references these deterministic names directly; the build fails
 * loudly via the reference check in the crawler/CI rather than silently
 * shipping a 404. Hash-cached like the blog pipeline so unchanged sources
 * are skipped. The originals stay in the repo as source material and are
 * pruned from the deployed output (scripts/prune-private.mjs).
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const SOURCE_DIRS = ['products', 'warehouse', 'industries', 'team', 'banners'];
const WIDTHS = [480, 960, 1440];
const WEBP_QUALITY = 75;
const JPEG_QUALITY = 78;
const CONFIG_VERSION = 1; // bump to force regeneration

function exists(path) {
  return access(path).then(() => true, () => false);
}

/** Rendition widths for a source of the given intrinsic width. */
export function renditionWidths(sourceWidth) {
  const max = Math.min(1440, sourceWidth);
  const widths = WIDTHS.filter((w) => w < max);
  widths.push(max);
  return widths;
}

/**
 * Generate renditions for every source image. Returns the number produced
 * (excluding cache hits).
 */
export async function processStaticImages(siteRoot, cache) {
  const outRoot = join(siteRoot, 'assets', 'images', 'renditions');
  let produced = 0;

  for (const dir of SOURCE_DIRS) {
    const srcDir = join(siteRoot, 'assets', 'images', dir);
    let entries;
    try {
      entries = await readdir(srcDir);
    } catch {
      continue; // source dir absent (e.g. already pruned) — nothing to do
    }

    for (const file of entries) {
      if (!/\.(jpe?g|png|webp)$/i.test(file) || file.startsWith('._')) continue;

      const srcPath = join(srcDir, file);
      const buf = await readFile(srcPath);
      const key = `${dir}/${file}`;
      const hash = createHash('sha1').update(buf).digest('hex') + `:${CONFIG_VERSION}`;

      const stem = file.replace(/\.[^.]+$/, '');
      const meta = await sharp(buf).metadata();
      const widths = renditionWidths(meta.width);
      const jpegWidth = Math.min(960, meta.width);

      const outputs = [
        ...widths.map((w) => ({ w, path: join(outRoot, dir, `${stem}-${w}.webp`), format: 'webp' })),
        { w: jpegWidth, path: join(outRoot, dir, `${stem}-${jpegWidth}.jpg`), format: 'jpeg' },
      ];

      const allPresent = (await Promise.all(outputs.map((o) => exists(o.path)))).every(Boolean);
      if (cache[key] === hash && allPresent) continue;

      await mkdir(join(outRoot, dir), { recursive: true });
      for (const out of outputs) {
        const pipeline = sharp(buf).resize({ width: out.w, withoutEnlargement: true });
        if (out.format === 'webp') {
          await pipeline.webp({ quality: WEBP_QUALITY }).toFile(out.path);
        } else {
          await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true }).toFile(out.path);
        }
        produced++;
      }
      cache[key] = hash;
    }
  }

  return produced;
}
