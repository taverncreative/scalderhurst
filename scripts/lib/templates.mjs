/**
 * HTML templates — post page, archive page, post card.
 * Uses tagged template literals. All variable interpolation escapes by default
 * unless the field name ends in "Html" (indicating already-sanitised HTML).
 */
import { archiveHead, postHead } from './seo.mjs';
import { CATEGORIES } from './posts.mjs';

/* ============================================================
   Escapers
   ============================================================ */

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   Date formatter
   ============================================================ */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ============================================================
   Post card (used in archive and related posts)
   ============================================================ */

export function postCard(post, images) {
  const url = `/news/${post.slug}/`;
  return `        <article>
          <a href="${url}" aria-label="Read: ${esc(post.title)}">
            <img src="${images.webp640}"
                 srcset="${images.webp640} 640w, ${images.webp1024} 1024w, ${images.webp1600} 1600w"
                 sizes="(min-width: 64rem) 22rem, (min-width: 48rem) 50vw, 100vw"
                 alt="${esc(post.coverAlt)}" loading="lazy" width="640" height="336">
          </a>
          <span class="card-badge card-badge--${post.category.slug}">${esc(post.category.label)}</span>
          <h3><a href="${url}">${esc(post.title)}</a></h3>
          <p class="card-meta"><time datetime="${post.date.toISOString()}">${formatDate(post.date)}</time> &middot; ${post.readingMinutes} min read</p>
          <p>${esc(post.excerpt)}</p>
          <a href="${url}">Read more</a>
        </article>`;
}

/* ============================================================
   Archive page template (/news/index.html)
   ============================================================ */

const DEFAULT_SECTION_COPY = {
  'stock-offers': {
    intro: 'From time to time we have surplus stock, clearance lines or special offers available at short notice. If you&rsquo;re flexible on grade or format, these can represent excellent value.',
    emptyHeading: 'No current offers',
    emptyBody: 'There are no special offers listed at the moment. Contact us on <a href="tel:+441233840711">+44(0)1233 840711</a> or <a href="mailto:info@scalderhurst.co.uk">info@scalderhurst.co.uk</a> to ask about current stock availability &mdash; we often have material that hasn&rsquo;t made it onto this page yet.',
  },
  'company-updates': {
    intro: 'News from Scalderhurst &mdash; new capabilities, team changes, site developments and other announcements.',
    emptyHeading: 'Coming soon',
    emptyBody: 'Company updates will appear here as they happen. In the meantime, get in touch if there&rsquo;s anything you&rsquo;d like to ask about.',
  },
  'industry-insights': {
    intro: 'Observations from the paper and board market &mdash; supply conditions, pricing trends and developments that may affect your business.',
    emptyHeading: 'Coming soon',
    emptyBody: 'We&rsquo;ll be sharing market observations and practical insights here as they become relevant. In the meantime, if you have questions about supply conditions or lead times, our team is always happy to talk.',
  },
};

function renderArchiveSection(group, imagesByPost) {
  const cat = group.category;
  const defaults = DEFAULT_SECTION_COPY[cat.slug] || {};
  const sectionClass = cat.slug === 'company-updates' ? ' class="section--surface"' : '';

  if (group.posts.length === 0) {
    return `    <section aria-labelledby="${cat.anchor}"${sectionClass}>
      <h2 id="${cat.anchor}">${esc(cat.label)}</h2>
      <p>${defaults.intro}</p>

      <article>
        <h3>${esc(defaults.emptyHeading)}</h3>
        <p>${defaults.emptyBody}</p>
      </article>
    </section>`;
  }

  const cards = group.posts
    .map(p => postCard(p, imagesByPost.get(p.slug)))
    .join('\n\n');

  return `    <section aria-labelledby="${cat.anchor}"${sectionClass}>
      <h2 id="${cat.anchor}">${esc(cat.label)}</h2>
      <p>${defaults.intro}</p>

      <div class="card-grid">
${cards}
      </div>
    </section>`;
}

export function archivePage(groups, imagesByPost) {
  const sections = groups.map(g => renderArchiveSection(g, imagesByPost)).join('\n\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${archiveHead()}
</head>

<body>

  <div data-include="header"></div>

  <nav aria-label="Breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li aria-current="page">News &amp; Offers</li>
    </ol>
  </nav>

  <main id="main-content">


    <!-- HERO -->
    <header class="hero hero--dark" aria-labelledby="hero-heading" style="background-image: url('/assets/images/warehouse/slideshow-05.jpg');">
      <div class="container">
        <h1 id="hero-heading">News &amp; Offers</h1>
        <p>Company updates, industry insights and available stock. Check back regularly or get in touch if you&rsquo;d like to be added to our mailing list.</p>
      </div>
    </header>


${sections}


    <!-- CTA -->
    <section aria-labelledby="cta-heading">
      <h2 id="cta-heading">Want to Hear From Us?</h2>
      <p>If you&rsquo;d like to receive stock alerts or company updates by email, let us know and we&rsquo;ll add you to the list.</p>
      <a href="/contact/" class="btn-primary" aria-label="Contact Scalderhurst to join the mailing list">Get in Touch</a>
    </section>


  </main>

  <div data-include="footer"></div>
  <script src="/assets/js/includes.js"></script>
  <script src="/assets/js/main.js" type="module"></script>

</body>
</html>
`;
}

/* ============================================================
   Post page template (/news/<slug>/index.html)
   ============================================================ */

export function postPage(post, images, related, imagesByPost) {
  const head = postHead(post, images);
  const bodyHtml = post.bodyHtml;
  const tagsHtml = post.tags.length
    ? `          <ul class="post-tags" aria-label="Tags">${post.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';

  const relatedHtml = related.length
    ? `    <!-- RELATED -->
    <section aria-labelledby="related-heading" class="section--surface">
      <h2 id="related-heading">More from ${esc(post.category.label)}</h2>
      <div class="card-grid">
${related.map(p => postCard(p, imagesByPost.get(p.slug))).join('\n\n')}
      </div>
    </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>

<body>

  <div data-include="header"></div>

  <nav aria-label="Breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li><a href="/news/">News &amp; Offers</a></li>
      <li aria-current="page">${esc(post.title)}</li>
    </ol>
  </nav>

  <main id="main-content">


    <!-- HERO -->
    <header class="hero hero--dark post-hero" aria-labelledby="hero-heading" style="background-image: url('${images.webp1600}');">
      <div class="container">
        <span class="text-overline">${esc(post.category.label)}</span>
        <h1 id="hero-heading">${esc(post.title)}</h1>
        <p class="post-meta">
          <time datetime="${post.date.toISOString()}">${formatDate(post.date)}</time>
          <span aria-hidden="true"> &middot; </span>
          <span>${post.readingMinutes} min read</span>
        </p>
      </div>
    </header>


    <!-- BODY -->
    <article class="post-body" aria-labelledby="hero-heading">
      <div class="container container--narrow">
${bodyHtml}
        <footer class="post-footer">
${tagsHtml}
          <button type="button" class="btn-secondary post-share" data-share aria-label="Share this article">Share</button>
        </footer>
      </div>
    </article>


${relatedHtml ? relatedHtml + '\n\n\n' : ''}    <!-- CTA -->
    <div data-include="cta"></div>


  </main>

  <div data-include="footer"></div>
  <script src="/assets/js/includes.js"></script>
  <script src="/assets/js/main.js" type="module"></script>
  <script src="/assets/js/share.js" defer></script>

</body>
</html>
`;
}
