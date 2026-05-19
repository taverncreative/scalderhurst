/**
 * Configured markdown-it instance.
 * - Enables HTML (sanitised later via sanitize-html).
 * - Adds anchor IDs to h2/h3 for deep-linking.
 * - Supports attribute blocks for flexibility (e.g. { .class } on headings).
 * - External links get rel="noopener" automatically.
 */
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import attrs from 'markdown-it-attrs';
import sanitizeHtml from 'sanitize-html';

import { slugify } from './slugify.mjs';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

md.use(anchor, {
  level: [2, 3],
  slugify,
  permalink: false,
});

md.use(attrs, {
  leftDelimiter: '{',
  rightDelimiter: '}',
  allowedAttributes: ['id', 'class', /^data-/],
});

// Add rel="noopener noreferrer" + target="_blank" to external links
const defaultLinkOpen = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const hrefIdx = token.attrIndex('href');
  if (hrefIdx >= 0) {
    const href = token.attrs[hrefIdx][1];
    if (/^https?:\/\//i.test(href) && !/scalderhurst\.co\.uk/i.test(href)) {
      token.attrSet('rel', 'noopener noreferrer');
      token.attrSet('target', '_blank');
    }
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/**
 * Sanitise rendered HTML — defence in depth.
 * Allowlist matches what our markdown-it config can produce.
 */
const sanitizeOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'a', 'ul', 'ol', 'li',
    'blockquote', 'strong', 'em', 'code', 'pre',
    'img', 'figure', 'figcaption', 'br', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    div: ['class'],
    th: ['scope'],
    '*': ['id'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  transformTags: {
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: attribs.loading || 'lazy' },
    }),
  },
};

export function renderMarkdown(body) {
  const raw = md.render(body || '');
  return sanitizeHtml(raw, sanitizeOptions);
}

/**
 * Convert markdown or HTML body to plain text (for auto-excerpt and word count).
 *
 * Post bodies authored via the CMS are HTML (output by TipTap). Bodies
 * authored directly in Markdown also work. This function handles both.
 */
export function markdownToPlainText(body) {
  if (!body) return '';
  return String(body)
    // Strip HTML comments
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Drop <script> / <style> blocks entirely
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // Strip all remaining HTML tags
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    // Decode the few HTML entities that appear in our content
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    // Remove fenced code blocks (Markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // Remove images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // Replace links with their text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Remove heading markers
    .replace(/^#+\s+/gm, '')
    // Remove emphasis / strong markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
