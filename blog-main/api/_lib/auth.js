const crypto = require('node:crypto');

const COOKIE_SESSION = 'blog_admin_session';
const COOKIE_STATE = 'blog_oauth_state';
const COOKIE_VERIFIER = 'blog_oauth_verifier';

const OWNER = process.env.GITHUB_OWNER || 'otavio-dias-leite';
const REPO = process.env.GITHUB_REPO || 'blog';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const ALLOWED_LOGIN = process.env.GITHUB_ALLOWED_LOGIN || 'otavio-dias-leite';

function originFromRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  return process.env.GITHUB_CALLBACK_URL || `${originFromRequest(req)}/api/auth/callback`;
}

function requireEnv() {
  for (const key of ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET']) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function randomString(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest();
}

function sessionKey() {
  return sha256(process.env.SESSION_SECRET);
}

function sealSession(payload) {
  requireEnv();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${base64url(iv)}.${base64url(cipher.getAuthTag())}.${base64url(ciphertext)}`;
}

function openSession(value) {
  try {
    requireEnv();
    const [ivB64, tagB64, ciphertextB64] = String(value).split('.');
    if (!ivB64 || !tagB64 || !ciphertextB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64url')),
      decipher.final(),
    ]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (!payload || !payload.accessToken || !payload.login || !payload.exp) return null;
    if (Date.now() >= payload.exp) return null;
    if (payload.login !== ALLOWED_LOGIN) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false && process.env.NODE_ENV !== 'development') parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}

function setCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

function clearCookie(res, name) {
  setCookie(res, serializeCookie(name, '', { maxAge: 0 }));
}

function getSession(req) {
  return openSession(parseCookies(req)[COOKIE_SESSION]);
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Não autenticado.' });
    return null;
  }
  return session;
}

function githubHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'otavio-blog-admin',
  };
}

async function githubRequest(path, options = {}, accessToken) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      ...githubHeaders(accessToken),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) {
    const message = data && typeof data === 'object' && data.message ? data.message : `GitHub API ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.github = data;
    throw error;
  }
  return data;
}

function repoPath(path) {
  return `/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/${path}`;
}

function postsRootPath() {
  return repoPath(`contents/content/posts?ref=${encodeURIComponent(BRANCH)}`);
}

function postFilePath(slug) {
  return repoPath(`contents/content/posts/${encodeURIComponent(slug)}.md?ref=${encodeURIComponent(BRANCH)}`);
}

function allowedSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function httpErrorStatus(error) {
  return error && Number.isInteger(error.status) ? error.status : 500;
}

module.exports = {
  ALLOWED_LOGIN,
  BRANCH,
  COOKIE_SESSION,
  COOKIE_STATE,
  COOKIE_VERIFIER,
  OWNER,
  REPO,
  allowedSlug,
  callbackUrl,
  clearCookie,
  getSession,
  githubRequest,
  httpErrorStatus,
  openSession,
  originFromRequest,
  postFilePath,
  postsRootPath,
  randomString,
  requireEnv,
  requireSession,
  sealSession,
  serializeCookie,
  setCookie,
  sha256,
  parseCookies,
};
