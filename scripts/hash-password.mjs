#!/usr/bin/env node
/**
 * Generate a scrypt password hash for the CMS admin account.
 *
 *   npm run hash-password -- 'whatever-password-you-pick'
 *
 * The full output string becomes the value of ADMIN_PASSWORD_HASH in
 * Vercel → Project Settings → Environment Variables.
 *
 * We never store the plaintext password anywhere.
 */
import { hashPassword } from '../lib/auth.js';

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run hash-password -- <password>');
  console.error('Example: npm run hash-password -- "Correct Horse Battery Staple"');
  process.exit(1);
}

if (pw.length < 10) {
  console.error('Password must be at least 10 characters for any real security.');
  process.exit(1);
}

const hash = await hashPassword(pw);
console.log('\nADMIN_PASSWORD_HASH=' + hash + '\n');
console.log('Paste the string above (after the = sign) into the Vercel env var.');
console.log('Set ADMIN_EMAIL and JWT_SECRET as well — see README section "CMS setup" for details.\n');
