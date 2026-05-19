/**
 * POST /api/login
 * Body: { email, password }
 *
 * - Rate-limited per IP (in-memory, best-effort across warm instances).
 * - scrypt password verification runs even on unknown email to keep
 *   timing consistent.
 * - On success: issues a 24h HTTP-only + SameSite=Strict JWT cookie.
 */
import { verifyPassword, signJwt, sessionCookie } from '../lib/auth.js';
import { checkLimit, recordFailure, reset, clientIp } from '../lib/rate-limit.js';

const LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = clientIp(req);
  const gate = checkLimit(ip, LOGIN_LIMIT);
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    return res.status(429).json({
      error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfter / 60)} minutes.`,
    });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminEmail || !passwordHash || !jwtSecret) {
    console.error('[api/login] Missing env config: ADMIN_EMAIL, ADMIN_PASSWORD_HASH, JWT_SECRET');
    return res.status(500).json({ error: 'Server is not configured. Please contact the site administrator.' });
  }

  const submittedEmail = String(email).trim().toLowerCase();
  const expectedEmail = adminEmail.trim().toLowerCase();

  // Always verify password (even if email wrong) to keep timing consistent.
  const passOk = await verifyPassword(String(password), passwordHash);
  const emailOk = submittedEmail === expectedEmail;

  if (!emailOk || !passOk) {
    recordFailure(ip, LOGIN_LIMIT);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  reset(ip);
  const token = signJwt({ sub: adminEmail, role: 'admin' }, jwtSecret);
  res.setHeader('Set-Cookie', sessionCookie(token));
  return res.status(200).json({ ok: true, email: adminEmail });
}
