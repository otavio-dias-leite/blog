const crypto = require('node:crypto');

const COOKIE_SESSION = 'blog_admin_session';
const OWNER = process.env.GITHUB_OWNER || 'otavio-dias-leite';
const REPO = process.env.GITHUB_REPO || 'blog';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const ALLOWED_LOGIN = process.env.ADMIN_USERNAME || 'otv';

function requireEnv() {
  for (const key of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'GITHUB_TOKEN']) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
}
function base64url(buffer) { return Buffer.from(buffer).toString('base64url'); }
function sessionKey() { return crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest(); }
function sealSession(payload) {
  requireEnv();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))), cipher.final()]);
  return `${base64url(iv)}.${base64url(cipher.getAuthTag())}.${base64url(ciphertext)}`;
}
function openSession(value) {
  try {
    requireEnv();
    const [iv, tag, body] = String(value || '').split('.');
    if (!iv || !tag || !body) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
    const payload = JSON.parse(plain.toString('utf8'));
    if (!payload || payload.login !== ALLOWED_LOGIN || !payload.exp || Date.now() >= payload.exp) return null;
    return payload;
  } catch { return null; }
}
function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}
function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false && process.env.NODE_ENV !== 'development') parts.push('Secure');
  parts.push('SameSite=Strict');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}
function setCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(existing ? (Array.isArray(existing) ? existing : [existing]) : []), cookie]);
}
function clearCookie(res, name) { setCookie(res, serializeCookie(name, '', { maxAge: 0 })); }
function getSession(req) { return openSession(parseCookies(req)[COOKIE_SESSION]); }
function requireSession(req, res) {
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'Não autenticado.' }); return null; }
  return session;
}
function githubHeaders(accessToken) {
  const token = accessToken || process.env.GITHUB_TOKEN;
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'otavio-blog-admin' };
}
async function githubRequest(path, options = {}, accessToken) {
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers: { ...githubHeaders(accessToken), ...(options.headers || {}) } });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = raw; }
  if (!response.ok) {
    const error = new Error(data && typeof data === 'object' && data.message ? data.message : `GitHub API ${response.status}`);
    error.status = response.status; throw error;
  }
  return data;
}
function repoPath(path) { return `/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/${path}`; }
function postsRootPath() { return repoPath(`contents/content/posts?ref=${encodeURIComponent(BRANCH)}`); }
function postFilePath(slug) { return repoPath(`contents/content/posts/${encodeURIComponent(slug)}.md?ref=${encodeURIComponent(BRANCH)}`); }
function allowedSlug(value) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
function httpErrorStatus(error) { return error && Number.isInteger(error.status) ? error.status : 500; }

module.exports = { ALLOWED_LOGIN, BRANCH, COOKIE_SESSION, OWNER, REPO, allowedSlug, clearCookie, getSession, githubRequest, httpErrorStatus, openSession, parseCookies, postFilePath, postsRootPath, requireEnv, requireSession, sealSession, serializeCookie, setCookie };
