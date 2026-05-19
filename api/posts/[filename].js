/**
 * /api/posts/[filename]
 *   GET     — fetch one post for editing. Returns frontmatter + body + sha.
 *   PUT     — update a post (body must include sha).
 *   DELETE  — delete a post (query or body must include sha).
 *
 * Filename must match YYYY-MM-DD-slug.md (enforced by isSafeFilename).
 */
import matter from 'gray-matter';
import { requireAuth } from '../../lib/auth.js';
import { getFile, putFile, deleteFile } from '../../lib/github.js';
import { buildPostFile, isSafeFilename, findSlugCollision } from '../../lib/posts-shared.js';

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  const filename = req.query.filename;
  if (!isSafeFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const path = `content/posts/${filename}`;

  try {
    if (req.method === 'GET') {
      const file = await getFile(path);
      if (!file) return res.status(404).json({ error: 'Not found' });
      const parsed = matter(file.content);
      const data = parsed.data || {};
      return res.status(200).json({
        filename,
        sha: file.sha,
        frontmatter: {
          title: data.title || '',
          slug: data.slug || '',
          category: data.category || '',
          date: data.date ? new Date(data.date).toISOString() : null,
          draft: data.draft === true,
          excerpt: data.excerpt || '',
          cover: data.cover || '',
          cover_alt: data.cover_alt || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
        },
        body: parsed.content || '',
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!body.sha) return res.status(400).json({ error: 'sha is required for updates' });

      const result = buildPostFile(body, { mode: 'update', existingFilename: filename });
      if (!result.ok) return res.status(400).json({ error: result.error });

      // Prevent slug collisions with OTHER posts (exclude this file)
      const clash = await findSlugCollision(result.slug, filename);
      if (clash) {
        return res.status(409).json({
          error: `Another post already uses the URL slug "${result.slug}" (file: ${clash}). Pick a different slug.`,
        });
      }

      await putFile(
        path,
        result.fileContent,
        `cms: update post — ${result.frontmatter.title}`,
        body.sha
      );

      return res.status(200).json({ ok: true, filename, slug: result.slug });
    }

    if (req.method === 'DELETE') {
      const sha = (req.body && req.body.sha) || req.query.sha;
      if (!sha) return res.status(400).json({ error: 'sha is required for delete' });

      // Best-effort commit message with the title
      let title = filename;
      try {
        const file = await getFile(path);
        if (file) {
          const parsed = matter(file.content);
          if (parsed.data && parsed.data.title) title = parsed.data.title;
        }
      } catch {
        // ignore — we'll use the filename
      }

      await deleteFile(path, `cms: delete post — ${title}`, sha);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/posts/[filename]]', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
