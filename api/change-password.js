/**
 * POST /api/change-password
 * Body: { currentPassword, newPassword }
 *
 * - Authenticated route (existing session required).
 * - Verifies the current password against the stored hash (file > env var).
 * - Hashes the new password with scrypt.
 * - Commits the new hash to content/.admin/password-hash.txt via GitHub.
 *   That file is web-blocked via the vercel.json rewrite for /content/.admin/*.
 * - Future logins read the file in preference to the env var.
 */
import {
  requireAuth,
  verifyPassword,
  hashPassword,
  getCurrentPasswordHash,
  PASSWORD_HASH_PATH,
} from '../lib/auth.js';
import { putFile } from '../lib/github.js';

const MIN_LENGTH = 10;

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (String(newPassword).length < MIN_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_LENGTH} characters` });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from the current one' });
  }

  try {
    const current = await getCurrentPasswordHash();
    if (!current) {
      return res.status(500).json({ error: 'Password storage is not configured on this deploy' });
    }

    const ok = await verifyPassword(String(currentPassword), current.hash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(String(newPassword));
    await putFile(
      PASSWORD_HASH_PATH,
      newHash,
      'cms: rotate admin password',
      current.source === 'file' ? current.sha : null
    );

    return res.status(200).json({
      ok: true,
      message: 'Password updated. The new password takes effect immediately.',
    });
  } catch (err) {
    console.error('[api/change-password]', err);
    return res.status(500).json({ error: err.message || 'Password change failed' });
  }
}
