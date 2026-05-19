/**
 * Minimal GitHub Contents API client.
 *
 * Uses a server-side fine-grained PAT to commit Markdown posts + uploaded
 * images to the repo. The end user of the CMS never sees GitHub — they log
 * in with email + password, and our server commits on their behalf using
 * a token stored only in Vercel env vars.
 *
 * Env vars:
 *   GITHUB_TOKEN   — fine-grained PAT with Contents: Read & Write on the repo
 *   GITHUB_REPO    — "owner/repo" e.g. "taverncreative/scalderhurst"
 *   GITHUB_BRANCH  — optional, defaults to "main"
 *
 * Commits by this token trigger Vercel's auto-deploy, so a saved post
 * appears on the live site ~30 seconds later.
 */
const API = 'https://api.github.com';

function repo() {
  const r = process.env.GITHUB_REPO;
  if (!r) throw new Error('GITHUB_REPO env var not configured');
  return r;
}

function branch() {
  return process.env.GITHUB_BRANCH || 'main';
}

function headers() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var not configured');
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'scalderhurst-cms',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function committerInfo() {
  return {
    name: process.env.GIT_COMMITTER_NAME || 'Scalderhurst CMS',
    email: process.env.GIT_COMMITTER_EMAIL || 'cms@scalderhurst.co.uk',
  };
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * GET a single file. Returns { sha, content: string, raw } or null if 404.
 * Uses the raw endpoint to avoid size limits on the JSON endpoint.
 */
export async function getFile(path) {
  const url = `${API}/repos/${repo()}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch())}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub getFile ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return null; // it's a directory
  const content =
    data.encoding === 'base64' && data.content
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : '';
  return { sha: data.sha, content, raw: data };
}

/**
 * Create or update a file. Pass `sha` for updates; omit for create.
 * Content can be a string or Buffer.
 */
export async function putFile(path, content, message, sha = null) {
  const url = `${API}/repos/${repo()}/contents/${encodePath(path)}`;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf-8');
  const body = {
    message,
    content: buf.toString('base64'),
    branch: branch(),
    committer: committerInfo(),
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub putFile ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function deleteFile(path, message, sha) {
  const url = `${API}/repos/${repo()}/contents/${encodePath(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sha,
      branch: branch(),
      committer: committerInfo(),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub deleteFile ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * List a directory. Returns an array (possibly empty). 404 returns [].
 */
export async function listDirectory(path) {
  const url = `${API}/repos/${repo()}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch())}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`GitHub listDirectory ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
