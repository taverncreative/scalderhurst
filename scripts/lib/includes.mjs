/**
 * Build-time include resolution.
 *
 * Fills every `<div data-include="name"></div>` placeholder with the
 * matching /components/<name>.html so the header, footer and CTA ship in
 * the HTML itself instead of being injected client-side (which shifted
 * layout after load — measurable CLS on the contact page).
 *
 * The filled markup keeps the wrapper div — identical DOM to what
 * includes.js used to produce — and brackets the content with
 * resolved-include comment markers so the step is idempotent: on every
 * build, previously resolved blocks are collapsed back to bare
 * placeholders and re-expanded from the current component source. Pages
 * therefore only change in git when a component actually changes.
 *
 * includes.js remains as a no-op fallback for any unresolved placeholder.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', 'components', '_templates', 'scripts', 'lib', 'api',
  'content', 'assets',
]);

const OPEN_MARK = '<!-- resolved:include -->';
const CLOSE_MARK = '<!-- /resolved:include -->';

const RESET_RE = new RegExp(
  `(<div data-include="([\\w-]+)">)${OPEN_MARK}[\\s\\S]*?${CLOSE_MARK}(</div>)`,
  'g'
);
const PLACEHOLDER_RE = /<div data-include="([\w-]+)"><\/div>/g;

async function loadComponents(siteRoot) {
  const dir = join(siteRoot, 'components');
  const components = {};
  for (const file of await readdir(dir)) {
    if (file.endsWith('.html')) {
      const name = file.replace(/\.html$/, '');
      components[name] = (await readFile(join(dir, file), 'utf-8')).trim();
    }
  }
  return components;
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
  return out;
}

/**
 * Resolve includes across every page in the site root.
 * Returns the number of files rewritten.
 */
export async function resolveIncludes(siteRoot) {
  const components = await loadComponents(siteRoot);
  let changed = 0;

  for (const file of await htmlFiles(siteRoot)) {
    const before = await readFile(file, 'utf-8');

    // Collapse previously resolved blocks back to bare placeholders…
    let html = before.replace(RESET_RE, '$1$3');

    // …then expand every placeholder from current component source.
    html = html.replace(PLACEHOLDER_RE, (match, name) => {
      const content = components[name];
      if (!content) {
        throw new Error(`Unknown component "${name}" referenced in ${file}`);
      }
      return `<div data-include="${name}">${OPEN_MARK}\n${content}\n${CLOSE_MARK}</div>`;
    });

    if (html !== before) {
      await writeFile(file, html, 'utf-8');
      changed++;
    }
  }

  return changed;
}
