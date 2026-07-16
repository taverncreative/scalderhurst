# Security notes

Operational security notes for the Scalderhurst site and CMS. Not published to
the site (this file lives in the repo only — and see the caveat below about
what the deployment serves).

## Admin password: rotation required after next deploy

Until July 2026 the deployed site served `content/.admin/password-hash.txt`
publicly (Vercel serves existing static files before evaluating rewrites, so
the `vercel.json` rewrite intended to block it never applied). The scrypt hash
of the admin password must therefore be treated as harvested:

- The current hash **remains in git history** even after rotation. History
  rewriting is not planned; instead, rotate the password so the historic hash
  is worthless.
- **Action after the fix deploys:** log in to `/admin/`, change the password
  via the change-password form (this commits a fresh hash), and confirm the
  old password no longer works.
- The fix: `scripts/prune-private.mjs` removes `content/.admin/` and
  `content/posts/` from the build output on Vercel (`npm run build:vercel`).
  The API never reads the hash from the deployed filesystem — it reads it
  from GitHub via the Contents API, falling back to `ADMIN_PASSWORD_HASH`.

## What the deployment serves

`outputDirectory` is the repo root, so anything not pruned is a public URL.
Source files under `/lib/` and `/scripts/` are served (no secrets in them,
but keep it that way — never hard-code tokens, keys or hashes in source).
`/api/` is handled by Vercel as serverless functions and is not served as
static files. `package.json` and dotfiles at the root are excluded by Vercel.

## Environment variables (Vercel project settings)

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Single admin account email for CMS login |
| `ADMIN_PASSWORD_HASH` | Bootstrap scrypt hash (`npm run hash-password`); the committed hash file takes precedence once it exists |
| `JWT_SECRET` | Session-token signing secret, ≥ 32 random chars |
| `GITHUB_TOKEN` | Fine-grained PAT, Contents: Read & Write on this repo only |
| `GITHUB_REPO` | `owner/repo`, e.g. `taverncreative/scalderhurst` |
| `GITHUB_BRANCH` | Optional, defaults to `main` |
| `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` | Optional CMS commit identity |
| `RESEND_API_KEY` | Resend API key for contact-form email delivery |
| `CONTACT_TO_EMAIL` | Where enquiry emails are delivered (comma-separate for several) |
| `CONTACT_FROM_EMAIL` | Verified Resend sender. Until scalderhurst.co.uk DNS is verified with Resend, use `onboarding@resend.dev` (test mode: delivers only to the Resend account owner's address) |
| `CONTACT_CC_EMAIL` | Optional CC on enquiry emails |

Secrets live only in Vercel env vars. Never commit them, never log them.
