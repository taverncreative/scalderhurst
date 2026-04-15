/**
 * SEO generators — meta tags + JSON-LD for post pages and archive.
 */

const SITE = {
  name: 'Scalderhurst',
  url: 'https://www.scalderhurst.co.uk',
  logo: 'https://www.scalderhurst.co.uk/assets/images/logos/scalderhurst-blue.png',
  foundingDate: '1973',
};

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absoluteUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return SITE.url + (path.startsWith('/') ? path : '/' + path);
}

export function postCanonicalUrl(post) {
  return `${SITE.url}/news/${post.slug}/`;
}

/**
 * Return the full <head> meta block for a post page.
 * Includes title, description, OG, Twitter, canonical, preconnects, stylesheet,
 * and both JSON-LD blocks (Article + BreadcrumbList).
 */
export function postHead(post, images) {
  const canonical = postCanonicalUrl(post);
  const description = post.excerpt;
  const title = `${post.title} | ${SITE.name}`;

  const ogImage = absoluteUrl(images.jpg1200);
  const ogImageWebp = absoluteUrl(images.webp1600);
  const iso = post.date.toISOString();
  const isoMod = post.modifiedDate.toISOString();

  const articleTags = post.tags
    .map(t => `  <meta property="article:tag" content="${escapeAttr(t)}">`)
    .join('\n');

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    headline: post.title.length > 110 ? post.title.slice(0, 107) + '…' : post.title,
    description,
    image: [ogImageWebp, ogImage],
    datePublished: iso,
    dateModified: isoMod,
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: SITE.logo },
    },
    articleSection: post.category.label,
    ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    wordCount: post.wordCount,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',           item: `${SITE.url}/` },
      { '@type': 'ListItem', position: 2, name: 'News & Offers',  item: `${SITE.url}/news/` },
      { '@type': 'ListItem', position: 3, name: post.title,       item: canonical },
    ],
  };

  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeAttr(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeAttr(post.coverAlt)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="article:published_time" content="${iso}">
  <meta property="article:modified_time" content="${isoMod}">
  <meta property="article:section" content="${escapeAttr(post.category.label)}">
${articleTags ? articleTags + '\n' : ''}
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">

  <!-- Feed -->
  <link rel="alternate" type="application/rss+xml" title="${SITE.name} News" href="/news/feed.xml">

  <!-- Favicon -->
  <link rel="icon" href="/favicon.png" type="image/png">

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <!-- Stylesheet -->
  <link rel="stylesheet" href="/assets/css/main.css?v=2">

  <!-- JSON-LD: BreadcrumbList -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd, null, 2)}</script>

  <!-- JSON-LD: Article -->
  <script type="application/ld+json">${JSON.stringify(articleJsonLd, null, 2)}</script>`;
}

/**
 * Return the <head> meta block for the /news/ archive.
 */
export function archiveHead() {
  const canonical = `${SITE.url}/news/`;
  const title = `News & Offers | ${SITE.name}`;
  const description = 'Company updates, industry news and available stock from Scalderhurst. Paper and board offers, market insights and business announcements.';

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',          item: `${SITE.url}/` },
      { '@type': 'ListItem', position: 2, name: 'News & Offers', item: canonical },
    ],
  };

  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">

  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE.name}">
  <meta name="twitter:card" content="summary">

  <link rel="alternate" type="application/rss+xml" title="${SITE.name} News" href="/news/feed.xml">

  <link rel="icon" href="/favicon.png" type="image/png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/main.css?v=2">

  <script type="application/ld+json">${JSON.stringify(breadcrumb, null, 2)}</script>`;
}

export { SITE };
