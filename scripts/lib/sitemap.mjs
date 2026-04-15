/**
 * Regenerate /sitemap.xml.
 *
 * Preserves the static URLs that existed before the build and appends one
 * entry per published post, plus /news/ itself.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SITE_URL = 'https://www.scalderhurst.co.uk';

const STATIC_URLS = [
  { loc: '/',                             changefreq: 'weekly',  priority: '1.0' },
  { loc: '/board-packaging/',             changefreq: 'monthly', priority: '0.8' },
  { loc: '/conversion/',                  changefreq: 'monthly', priority: '0.8' },
  { loc: '/warehousing-logistics/',       changefreq: 'monthly', priority: '0.8' },
  { loc: '/industries/',                  changefreq: 'monthly', priority: '0.8' },
  { loc: '/industries/food-packaging/',   changefreq: 'monthly', priority: '0.7' },
  { loc: '/industries/printing/',         changefreq: 'monthly', priority: '0.7' },
  { loc: '/industries/retail-packaging/', changefreq: 'monthly', priority: '0.7' },
  { loc: '/resources/',                   changefreq: 'monthly', priority: '0.7' },
  { loc: '/speciality/',                  changefreq: 'monthly', priority: '0.7' },
  { loc: '/export/',                      changefreq: 'monthly', priority: '0.7' },
  { loc: '/about/',                       changefreq: 'monthly', priority: '0.6' },
  { loc: '/contact/',                     changefreq: 'yearly',  priority: '0.6' },
];

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>
    <loc>${SITE_URL}${loc}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function writeSitemap(posts, siteRoot) {
  const newsEntry = urlEntry({
    loc: '/news/',
    lastmod: posts.length ? posts[0].date.toISOString().slice(0, 10) : undefined,
    changefreq: 'weekly',
    priority: '0.8',
  });

  const staticEntries = STATIC_URLS.map(urlEntry).join('\n');

  const postEntries = posts.map(post => urlEntry({
    loc: `/news/${post.slug}/`,
    lastmod: post.modifiedDate.toISOString().slice(0, 10),
    changefreq: 'yearly',
    priority: '0.6',
  })).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${newsEntry}${postEntries ? '\n' + postEntries : ''}
</urlset>
`;

  await writeFile(join(siteRoot, 'sitemap.xml'), xml, 'utf-8');
}
