/**
 * GET /api/me
 * Returns the current session (email + role) or 401.
 * The admin SPA calls this on load to decide login vs dashboard.
 */
import { getSessionFromRequest } from '../lib/auth.js';

export default async function handler(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  return res.status(200).json({ email: session.sub, role: session.role || 'admin' });
}
