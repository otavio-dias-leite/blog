const { getSession } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  return res.status(200).json({
    authenticated: true,
    login: session.login,
    avatarUrl: session.avatarUrl,
  });
};
