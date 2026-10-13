const crypto = require('node:crypto');
const { ALLOWED_LOGIN, COOKIE_SESSION, requireEnv, sealSession, serializeCookie, setCookie } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    requireEnv();
    const { username = '', password = '' } = req.body || {};
    const suppliedUser = Buffer.from(String(username));
    const expectedUser = Buffer.from(process.env.ADMIN_USERNAME);
    const suppliedPass = Buffer.from(String(password));
    const expectedPass = Buffer.from(process.env.ADMIN_PASSWORD);
    const userOk = suppliedUser.length === expectedUser.length && crypto.timingSafeEqual(suppliedUser, expectedUser);
    const passOk = suppliedPass.length === expectedPass.length && crypto.timingSafeEqual(suppliedPass, expectedPass);
    if (!userOk || !passOk) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    const session = sealSession({ login: ALLOWED_LOGIN, exp: Date.now() + 8 * 60 * 60 * 1000 });
    setCookie(res, serializeCookie(COOKIE_SESSION, session, { maxAge: 8 * 60 * 60 }));
    return res.status(200).json({ ok: true, redirect: '/blog/admin/' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Falha no login.' });
  }
};
