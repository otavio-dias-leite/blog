const {
  allowedSlug,
  githubRequest,
  httpErrorStatus,
  postFilePath,
  postsRootPath,
  requireSession,
  OWNER,
  REPO,
  BRANCH,
} = require('../_lib/auth');

function decodeContent(encoded) {
  return Buffer.from(String(encoded).replace(/\s/g, ''), 'base64').toString('utf8');
}

function parseScalar(line) {
  const value = line.split(':').slice(1).join(':').trim();
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
  if (!normalized.startsWith('---')) return { slug: fallbackSlug, title: fallbackSlug, body: normalized };
  const end = normalized.indexOf('\n---', 3);
  if (end < 0) return { slug: fallbackSlug, title: fallbackSlug, body: normalized };
  const frontmatter = normalized.slice(4, end).split(/\r?\n/).filter(Boolean);
  const meta = {};
  for (const line of frontmatter) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) meta[match[1]] = parseScalar(match[0]);
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
    body: normalized.slice(end + 4).replace(/^\r?\n/, ''),
  };
}

async function loadPostFile(accessToken, slug) {
  const file = await githubRequest(postFilePath(slug), {}, accessToken);
  return {
    ...parsePostMarkdown(decodeContent(file.content), slug),
    sha: file.sha,
    htmlUrl: file.html_url,
  };
}

async function listPosts(accessToken) {
  const files = await githubRequest(postsRootPath(), {}, accessToken);
  const markdownFiles = Array.isArray(files)
    ? files.filter((file) => file.type === 'file' && file.name.endsWith('.md'))
    : [];
  const posts = await Promise.all(markdownFiles.map(async (file) => {
    const slug = file.name.slice(0, -3);
    try {
      return await loadPostFile(accessToken, slug);
    } catch {
      return { slug, title: slug, date: '', draft: false, description: '', tags: [], categories: [], cover: '', body: '', sha: file.sha, htmlUrl: file.html_url };
    }
  }));
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return posts;
}

function quote(value) {
  return JSON.stringify(String(value ?? '').trim());
}

function makeMarkdown(input) {
  const lines = ['---', `title: ${quote(input.title)}`, `date: ${quote(input.date)}`, `draft: ${Boolean(input.draft)}`];
  if (input.description) lines.push(`description: ${quote(input.description)}`);
  if (input.tags?.length) lines.push(`tags: ${JSON.stringify(input.tags)}`);
  if (input.categories?.length) lines.push(`categories: ${JSON.stringify(input.categories)}`);
  if (input.cover) lines.push(`cover: ${quote(input.cover)}`);
  lines.push('---', '', String(input.body || '').trimEnd(), '');
  return lines.join('\n');
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
      const input = req.body || {};
      if (!input.slug || !allowedSlug(input.slug)) return res.status(400).json({ error: 'Slug inválido.' });
      if (!input.title?.trim()) return res.status(400).json({ error: 'Título obrigatório.' });
      if (!input.date) return res.status(400).json({ error: 'Data obrigatória.' });
      const path = `/repos/${OWNER}/${REPO}/contents/content/posts/${encodeURIComponent(input.slug)}.md`;
      const content = Buffer.from(makeMarkdown(input), 'utf8').toString('base64');
      const payload = JSON.stringify({ message: `post: add ${input.slug}`, content, branch: BRANCH });
      const result = await githubRequest(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload }, session.accessToken);
      return res.status(201).json({ ok: true, commitSha: result.commit?.sha || null, post: await loadPostFile(session.accessToken, input.slug) });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (error) {
    return res.status(httpErrorStatus(error)).json({ error: error.message || 'Não foi possível acessar o GitHub.' });
  }
};
