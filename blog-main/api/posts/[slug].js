const {
  allowedSlug,
  githubRequest,
  httpErrorStatus,
  postFilePath,
  requireSession,
  BRANCH,
} = require('../_lib/auth');

function decodeContent(encoded) {
  return Buffer.from(String(encoded).replace(/\s/g, ''), 'base64').toString('utf8');
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

async function getFile(accessToken, slug) {
  if (!allowedSlug(slug)) {
    const error = new Error('Slug inválido.');
    error.status = 400;
    throw error;
  }
  return githubRequest(postFilePath(slug), {}, accessToken);
}

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const slug = String(req.query?.slug || '').replace(/\.md$/, '');
  try {
    if (req.method === 'GET') {
      const file = await getFile(session.accessToken, slug);
      return res.status(200).json({ slug, sha: file.sha, content: decodeContent(file.content), htmlUrl: file.html_url });
    }

    if (req.method === 'PUT') {
      const input = req.body || {};
      if (!input.slug || !allowedSlug(input.slug)) return res.status(400).json({ error: 'Slug inválido.' });
      if (!input.title?.trim()) return res.status(400).json({ error: 'Título obrigatório.' });
      if (!input.date) return res.status(400).json({ error: 'Data obrigatória.' });

      const current = await getFile(session.accessToken, slug);
      const content = Buffer.from(makeMarkdown(input), 'utf8').toString('base64');
      const targetPath = `/repos/${process.env.GITHUB_OWNER || 'otavio-dias-leite'}/${process.env.GITHUB_REPO || 'blog'}/contents/content/posts/${encodeURIComponent(input.slug)}.md`;

      if (input.slug === slug) {
        const result = await githubRequest(targetPath, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `post: update ${input.slug}`, content, sha: current.sha, branch: BRANCH }),
        }, session.accessToken);
        return res.status(200).json({ ok: true, commitSha: result.commit?.sha || null });
      }

      await githubRequest(targetPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `post: rename ${slug} to ${input.slug}`, content, branch: BRANCH }),
      }, session.accessToken);
      await githubRequest(`/repos/${process.env.GITHUB_OWNER || 'otavio-dias-leite'}/${process.env.GITHUB_REPO || 'blog'}/contents/content/posts/${encodeURIComponent(slug)}.md`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `post: remove old slug ${slug}`, sha: current.sha, branch: BRANCH }),
      }, session.accessToken);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const current = await getFile(session.accessToken, slug);
      const owner = process.env.GITHUB_OWNER || 'otavio-dias-leite';
      const repo = process.env.GITHUB_REPO || 'blog';
      const result = await githubRequest(`/repos/${owner}/${repo}/contents/content/posts/${encodeURIComponent(slug)}.md`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `post: delete ${slug}`, sha: current.sha, branch: BRANCH }),
      }, session.accessToken);
      return res.status(200).json({ ok: true, commitSha: result.commit?.sha || null });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (error) {
    return res.status(httpErrorStatus(error)).json({ error: error.message || 'Falha ao editar o post.' });
  }
};
