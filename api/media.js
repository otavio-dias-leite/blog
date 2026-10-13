const crypto = require('node:crypto');
const {
  githubRequest,
  httpErrorStatus,
  requireSession,
  OWNER,
  REPO,
  BRANCH,
} = require('./_lib/auth');

const MAX_BYTES = 2.5 * 1024 * 1024;
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const input = req.body || {};
    const mimeType = String(input.mimeType || '').toLowerCase();
    const extension = TYPES[mimeType];
    if (!extension) return res.status(415).json({ error: 'Formato de imagem não suportado.' });

    const dataMatch = String(input.data || '').match(/^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/);
    if (!dataMatch || dataMatch[1].toLowerCase() !== mimeType) {
      return res.status(400).json({ error: 'Arquivo de imagem inválido.' });
    }

    const base64 = dataMatch[2];
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'O limite de upload é 2,5 MB por imagem.' });
    }

    const original = String(input.filename || 'imagem')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'imagem';

    const filename = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + original + '.' + extension;
    const path = `/repos/${OWNER}/${REPO}/contents/static/uploads/${encodeURIComponent(filename)}`;
    const result = await githubRequest(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'media: upload ' + filename,
        content: base64,
        branch: BRANCH,
      }),
    }, session.accessToken);

    return res.status(201).json({
      ok: true,
      filename,
      url: '/blog/uploads/' + filename,
      commitSha: result.commit?.sha || null,
    });
  } catch (error) {
    return res.status(httpErrorStatus(error)).json({ error: error.message || 'Falha ao enviar imagem.' });
  }
};
