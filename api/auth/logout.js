const { COOKIE_SESSION, clearCookie } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  clearCookie(res, COOKIE_SESSION);
  if (req.method === 'GET') {
    res.writeHead(302, { Location: '/blog/admin/' });
    return res.end();
  }
  return res.status(204).end();
};
