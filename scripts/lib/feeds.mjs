/**
 * Generate /news/feed.xml (RSS 2.0) and /news/feed.json (JSON Feed 1.1).
 * Limits to 20 most recent posts.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SITE } from './seo.mjs';

const FEED_LIMIT = 20;

function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(s) {
  return `<![CDATA[${String(s || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function absolute(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return SITE.url + (url.startsWith('/') ? url : '/' + url);
}

export async function writeFeeds(posts, imagesByPost, siteRoot) {
  const recent = posts.slice(0, FEED_LIMIT);
  const newsDir = join(siteRoot, 'news');
  await mkdir(newsDir, { recursive: true });

  // RSS 2.0
  const rssItems = recent.map(post => {
    const url = `${SITE.url}/news/${post.slug}/`;
    const images = imagesByPost.get(post.slug);
    const imgUrl = absolute(images?.jpg1200);
    return `    <item>
      <title>${escXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${post.date.toUTCString()}</pubDate>
      <category>${escXml(post.category.label)}</category>
      <description>${cdata(post.excerpt)}</description>
      <content:encoded>${cdata(post.bodyHtml)}</content:encoded>
      <enclosure url="${imgUrl}" type="image/jpeg"/>
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE.name} — News &amp; Offers</title>
    <link>${SITE.url}/news/</link>
    <description>Company updates, industry news and available stock from ${SITE.name}.</description>
    <language>en-GB</language>
    <atom:link href="${SITE.url}/news/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;

  await writeFile(join(newsDir, 'feed.xml'), rss, 'utf-8');

  // JSON Feed 1.1
  const json = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${SITE.name} — News & Offers`,
    home_page_url: `${SITE.url}/news/`,
    feed_url: `${SITE.url}/news/feed.json`,
    description: `Company updates, industry news and available stock from ${SITE.name}.`,
    language: 'en-GB',
    items: recent.map(post => {
      const images = imagesByPost.get(post.slug);
      return {
        id: `${SITE.url}/news/${post.slug}/`,
        url: `${SITE.url}/news/${post.slug}/`,
        title: post.title,
        summary: post.excerpt,
        content_html: post.bodyHtml,
        image: absolute(images?.jpg1200),
        date_published: post.date.toISOString(),
        date_modified: post.modifiedDate.toISOString(),
        tags: [post.category.label, ...post.tags],
      };
    }),
  };

  await writeFile(join(newsDir, 'feed.json'), JSON.stringify(json, null, 2), 'utf-8');
}
