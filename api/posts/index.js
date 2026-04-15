/**
 * /api/posts
 *   GET   — list all posts (drafts included). Admin only.
 *   POST  — create a new post. Admin only.
 *
 * Reads + writes live in the GitHub repo under /content/posts/.
 */
import matter from 'gray-matter';
import { requireAuth } from '../../lib/auth.js';
import { getFile, listDirectory, putFile } from '../../lib/github.js';
import { buildPostFile, findSlugCollision } from '../../lib/posts-shared.js';

function deriveStatus(data) {
  if (data.draft === true) return 'draft';
  if (data.date) {
    const d = new Date(data.date);
    if (!isNaN(d) && d.getTime() > Date.now()) return 'scheduled';
  }
  return 'published';
}

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      const entries = await listDirectory('content/posts');
      const mdFiles = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md'));

      const posts = await Promise.all(
        mdFiles.map(async (f) => {
          try {
            const file = await getFile(`content/posts/${f.name}`);
            const parsed = matter(file.content);
            const data = parsed.data || {};
            return {
              filename: f.name,
              sha: file.sha,
              title: String(data.title || '').trim(),
              slug: String(data.slug || '').trim(),
              category: String(data.category || '').trim(),
              date: data.date ? new Date(data.date).toISOString() : null,
              status: deriveStatus(data),
              excerpt: data.excerpt || '',
              cover: data.cover || '',
            };
          } catch (err) {
            return {
              filename: f.name,
              sha: null,
              title: `[Error: ${err.message}]`,
              status: 'error',
            };
          }
        })
      );

      posts.sort((a, b) => {
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        return db - da;
      });

      return res.status(200).json({ posts });
    }

    if (req.method === 'POST') {
      const result = buildPostFile(req.body, { mode: 'create' });
      if (!result.ok) return res.status(400).json({ error: result.error });

      const path = `content/posts/${result.filename}`;

      // Guard A — same filename already exists (same date + slug combination)
      const existing = await getFile(path);
      if (existing) {
        return res.status(409).json({
          error: 'A post with this slug already exists on this date. Change the slug or date.',
        });
      }

      // Guard B — another post already publishes at the same URL (/news/<slug>/)
      const clash = await findSlugCollision(result.slug, null);
      if (clash) {
        return res.status(409).json({
          error: `Another post already uses the URL slug "${result.slug}" (file: ${clash}). Pick a different slug.`,
        });
      }

      await putFile(
        path,
        result.fileContent,
        `cms: create post — ${result.frontmatter.title}`
      );

      return res.status(201).json({
        ok: true,
        filename: result.filename,
        slug: result.slug,
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/posts]', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
