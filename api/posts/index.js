const {
  allowedSlug, githubRequest, httpErrorStatus, postFilePath, postsRootPath,
  requireSession, OWNER, REPO, BRANCH,
} = require('../_lib/auth');

function decodeContent(encoded) {
  return Buffer.from(String(encoded).replace(/\s/g, ''), 'base64').toString('utf8');
}

function parseScalar(line) {
  const value = line.slice(line.indexOf(':') + 1).trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value.startsWith('[') && value.endsWith(']')) {
    try { return JSON.parse(value); } catch { return []; }
  }
  return value;
}

function parsePostMarkdown(markdown, fallbackSlug) {
  const normalized = String(markdown).replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---')) return { slug: fallbackSlug, title: fallbackSlug, body: normalized, lang: 'auto' };
  const end = normalized.indexOf('\n---', 3);
  if (end < 0) return { slug: fallbackSlug, title: fallbackSlug, body: normalized, lang: 'auto' };
  const meta = {};
  for (const line of normalized.slice(4, end).split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) meta[match[1]] = parseScalar(line);
  }
  return {
    slug: fallbackSlug,
    title: meta.title || fallbackSlug,
    date: meta.date || '',
    draft: Boolean(meta.draft),
    description: meta.description || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    categories: Array.isArray(meta.categories) ? meta.categories : [],
    cover: meta.cover || '',
    lang: meta.lang || 'auto',
    body: normalized.slice(end + 4).replace(/^\r?\n/, ''),
  };
}

async function loadPostFile(accessToken, slug) {
  const file = await githubRequest(postFilePath(slug), {}, accessToken);
  return { ...parsePostMarkdown(decodeContent(file.content), slug), sha: file.sha, htmlUrl: file.html_url };
}

async function listPosts(accessToken) {
  const files = await githubRequest(postsRootPath(), {}, accessToken);
  const markdownFiles = Array.isArray(files) ? files.filter(file => file.type === 'file' && file.name.endsWith('.md')) : [];
  const posts = await Promise.all(markdownFiles.map(async file => {
    const slug = file.name.slice(0, -3);
    try { return await loadPostFile(accessToken, slug); }
    catch { return { slug, title: slug, date: '', draft: false, description: '', tags: [], categories: [], cover: '', lang: 'auto', body: '', sha: file.sha, htmlUrl: file.html_url }; }
  }));
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return posts;
}

function quote(value) { return JSON.stringify(String(value ?? '').trim()); }
function normalizeInput(input) {
  const lang = String(input.lang || 'auto').trim();
  if (!/^(auto|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/.test(lang)) {
    const error = new Error('Idioma de origem inválido.'); error.status = 400; throw error;
  }
  if (String(input.body || '').length > 500000) {
    const error = new Error('O conteúdo excede o limite de 500 KB.'); error.status = 413; throw error;
  }
  return { ...input, lang };
}
function makeMarkdown(input) {
  const lines = ['---', `title: ${quote(input.title)}`, `date: ${quote(input.date)}`, `draft: ${Boolean(input.draft)}`];
  if (input.lang && input.lang !== 'auto') lines.push(`lang: ${quote(input.lang)}`);
  if (input.description) lines.push(`description: ${quote(input.description)}`);
  if (input.tags?.length) lines.push(`tags: ${JSON.stringify(input.tags)}`);
  if (input.categories?.length) lines.push(`categories: ${JSON.stringify(input.categories)}`);
  if (input.cover) lines.push(`cover: ${quote(input.cover)}`);
  lines.push('---', '', String(input.body || '').trimEnd(), '');
  return lines.join('\n');
}
async function assertNewSlug(accessToken, slug) {
  try {
    await githubRequest(postFilePath(slug), {}, accessToken);
    const error = new Error('Já existe uma postagem com esse slug. Escolha outro.'); error.status = 409; throw error;
  } catch (error) {
    if (error.status === 409) throw error;
    if (error.status !== 404) throw error;
  }
}

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const posts = await listPosts(session.accessToken);
      return res.status(200).json({ posts, repo: `${OWNER}/${REPO}`, branch: BRANCH });
    }
    if (req.method === 'POST') {
      const input = normalizeInput(req.body || {});
      if (!input.slug || !allowedSlug(input.slug)) return res.status(400).json({ error: 'Slug inválido.' });
      if (!input.title?.trim()) return res.status(400).json({ error: 'Título obrigatório.' });
      if (!input.date) return res.status(400).json({ error: 'Data obrigatória.' });
      await assertNewSlug(session.accessToken, input.slug);
      const path = `/repos/${OWNER}/${REPO}/contents/content/posts/${encodeURIComponent(input.slug)}.md`;
      const content = Buffer.from(makeMarkdown(input), 'utf8').toString('base64');
      const result = await githubRequest(path, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `post: add ${input.slug}`, content, branch: BRANCH }),
      }, session.accessToken);
      return res.status(201).json({ ok: true, commitSha: result.commit?.sha || null, post: await loadPostFile(session.accessToken, input.slug) });
    }
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (error) {
    return res.status(httpErrorStatus(error)).json({ error: error.message || 'Não foi possível acessar o GitHub.' });
  }
};
