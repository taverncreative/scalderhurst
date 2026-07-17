/**
 * Build-time CSS bundling.
 *
 * Concatenates the partials in the exact @import order declared in
 * assets/css/main.css (the order is the single source of truth), applies a
 * conservative minification, and writes a single assets/css/main.min.css.
 * The file is content-hashed; every page's stylesheet <link> is rewritten to
 * /assets/css/main.min.css?v=<hash8>, so the cache-buster changes only when
 * the CSS actually changes — no more manual version bumping.
 *
 * main.css stays in the repo as the import-order manifest (and for dev tools);
 * main.min.css is a gitignored build artefact, regenerated every build.
 *
 * Minification is deliberately simple (no new dependency): strip comments,
 * collapse whitespace, and tidy punctuation around { } ; , — it never touches
 * `:` or descendant-combinator spaces, so selectors and pseudo-classes are
 * preserved exactly.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '_templates', 'components', 'scripts', 'lib', 'api',
  'content', 'assets',
]);

function minify(css) {
  return css
    // strip /* ... */ comments (none of our CSS embeds /* inside strings)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // collapse all whitespace runs (incl. newlines) to a single space
    .replace(/\s+/g, ' ')
    // remove spaces around block punctuation
    .replace(/\s*([{};,])\s*/g, '$1')
    // drop the last semicolon before a closing brace
    .replace(/;}/g, '}')
    .trim();
}

async function htmlFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        await htmlFiles(join(dir, entry.name), out);
      }
    } else if (entry.name.endsWith('.html')) {
      out.push(join(dir, entry.name));
    }
  }
  // news/ is generated and lives under the site root, but SKIP excludes assets
  // only — news/ is NOT skipped, so it is included. admin/ is skipped below.
  return out;
}

// Rewrite any existing main / main.min stylesheet ref to the hashed bundle.
const CSS_LINK_RE = /\/assets\/css\/main(?:\.min)?\.css(?:\?v=[^"']*)?/g;

/**
 * Bundle + minify CSS and rewrite stylesheet links across all pages.
 * Returns { hash, bytes, rewritten }.
 */
export async function bundleCss(siteRoot) {
  const cssDir = join(siteRoot, 'assets', 'css');
  const main = await readFile(join(cssDir, 'main.css'), 'utf-8');

  // Import order = the source of truth
  const partials = [...main.matchAll(/@import\s+'([^']+?)(?:\?[^']*)?'/g)].map((m) => m[1]);

  let bundle = '';
  for (const p of partials) {
    bundle += await readFile(join(cssDir, p), 'utf-8') + '\n';
  }
  const min = minify(bundle);
  const hash = createHash('sha1').update(min).digest('hex').slice(0, 8);

  await writeFile(join(cssDir, 'main.min.css'), min, 'utf-8');

  const ref = `/assets/css/main.min.css?v=${hash}`;
  let rewritten = 0;
  for (const file of await htmlFiles(siteRoot)) {
    if (file.includes('/admin/')) continue; // admin has its own stylesheet
    const before = await readFile(file, 'utf-8');
    const after = before.replace(CSS_LINK_RE, ref);
    if (after !== before) {
      await writeFile(file, after, 'utf-8');
      rewritten++;
    }
  }

  return { hash, bytes: min.length, rewritten };
}
