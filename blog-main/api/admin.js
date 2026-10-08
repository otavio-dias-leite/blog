const fs = require('node:fs');
const path = require('node:path');
const { getSession } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Método não permitido.');

  if (!getSession(req)) {
    res.writeHead(302, { Location: '/api/auth/login' });
    return res.end();
  }

  try {
    const html = fs.readFileSync(path.join(process.cwd(), 'private', 'admin.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send(`Não foi possível carregar o painel: ${error.message}`);
  }
};
