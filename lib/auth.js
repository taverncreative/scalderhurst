/**
 * Auth helpers — zero third-party dependencies.
 *
 * Password hashing:  Node's built-in scrypt.
 * Session tokens:    JWT (HS256) signed with Node's built-in HMAC.
 * Cookies:           HTTP-only, Secure, SameSite=Lax.
 *
 * Env vars required by callers:
 *   ADMIN_EMAIL           — the single admin account email
 *   ADMIN_PASSWORD_HASH   — output of `node scripts/hash-password.mjs <password>`
 *   JWT_SECRET            — any long random string (>= 32 chars)
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const COOKIE_NAME = 'scalderhurst_session';
// 24 hours — reasonable for daily editorial use, tight enough to limit the
// window of exposure if a session cookie is ever compromised.
const SESSION_MAX_AGE = 24 * 60 * 60;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(String(plain), salt, SCRYPT.keylen);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(plain, encoded) {
  if (!encoded || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(String(plain), salt, expected.length, {
      N: parseInt(N, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function signJwt(payload, secret, expiresInSeconds = SESSION_MAX_AGE) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = b64url(
    crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest()
  );
  return `${h}.${p}.${sig}`;
}

export function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const expected = b64url(
      crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest()
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const body = JSON.parse(b64urlDecode(p).toString('utf-8'));
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(/;\s*/).forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > -1) {
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1);
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

/**
 * Session cookie attributes:
 *   HttpOnly  — not readable from JavaScript, mitigates XSS cookie theft.
 *   Secure    — sent only over HTTPS.
 *   SameSite=Strict — never sent on cross-site requests; blocks CSRF.
 *
 * Note on SameSite=Strict: the admin is always opened by typing/bookmarking
 * /admin/ directly, so this has no UX cost here. If we ever allow external
 * redirects into /admin/, we'd need to revisit.
 */
export function sessionCookie(token, maxAge = SESSION_MAX_AGE) {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return null;
  return verifyJwt(token, secret);
}

/**
 * Middleware-style helper. Call at the start of any protected handler.
 *   const session = requireAuth(req, res);
 *   if (!session) return;
 */
export function requireAuth(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }
  return session;
}

export { COOKIE_NAME };
