/**
 * POST /api/uploads
 * Body: { filename, contentType, dataBase64 }
 *
 * Commits the image to /content/uploads/YYYY/MM/<safe-name>.<ext>
 * and returns the public path. The site build picks these up when
 * rendering posts; the raw path is also served directly (see vercel.json).
 *
 * Size limit: 3 MB pre-encoding. Base64 inflates ~33%, so the JSON body
 * stays under Vercel's 4.5 MB serverless function body limit.
 */
import crypto from 'node:crypto';
import { requireAuth } from '../lib/auth.js';
import { putFile } from '../lib/github.js';

export const config = {
  api: {
    bodyParser: { sizeLimit: '5mb' },
  },
};

const MAX_BYTES = 3 * 1024 * 1024;

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function sanitiseBasename(name) {
  const stem = String(name || 'image').replace(/\.[^.]+$/, '');
  const cleaned = stem
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'image';
}

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, contentType, dataBase64 } = req.body || {};

    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'dataBase64 is required' });
    }
    const ext = MIME_TO_EXT[String(contentType).toLowerCase()];
    if (!ext) {
      return res.status(400).json({
        error: 'Unsupported image type. Please use JPEG, PNG, WebP, GIF, or AVIF.',
      });
    }

    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length === 0) return res.status(400).json({ error: 'Empty file' });
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({
        error: `File too large. Max 3 MB (got ${(buf.length / 1024 / 1024).toFixed(1)} MB).`,
      });
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

    // Always append a short random suffix so we never overwrite an existing
    // upload. Avoids a GET round-trip and eliminates the race condition
    // where two parallel uploads see the same "not found" and then clash
    // on PUT.
    const base = sanitiseBasename(filename);
    const suffix = crypto.randomBytes(4).toString('hex');
    const outName = `${base}-${suffix}.${ext}`;
    const path = `content/uploads/${yyyy}/${mm}/${outName}`;

    await putFile(path, buf, `cms: upload ${outName}`);

    return res.status(201).json({
      ok: true,
      path: `/${path}`,
      filename: outName,
      size: buf.length,
    });
  } catch (err) {
    console.error('[api/uploads]', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
}
