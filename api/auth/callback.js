const {
  ALLOWED_LOGIN,
  COOKIE_SESSION,
  COOKIE_STATE,
  COOKIE_VERIFIER,
  callbackUrl,
  clearCookie,
  githubRequest,
  parseCookies,
  requireEnv,
  sealSession,
  serializeCookie,
  setCookie,
} = require('../_lib/auth');

module.exports = async function handler(req, res) {
  try {
    requireEnv();
    if (req.method !== 'GET') return res.status(405).send('Método não permitido.');

    const { code, state, error: oauthError } = req.query || {};
    if (oauthError) return res.status(403).send('O login com GitHub foi cancelado.');

    const cookies = parseCookies(req);
    if (!code || !state || state !== cookies[COOKIE_STATE] || !cookies[COOKIE_VERIFIER]) {
      return res.status(400).send('A tentativa de autenticação expirou ou é inválida.');
    }

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: String(code),
      redirect_uri: callbackUrl(req),
      code_verifier: cookies[COOKIE_VERIFIER],
    });

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'otavio-blog-admin',
      },
      body: params.toString(),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(502).send('O GitHub não autorizou esta sessão.');
    }

    const user = await githubRequest('/user', {}, tokenData.access_token);
    if (user.login !== ALLOWED_LOGIN) {
      clearCookie(res, COOKIE_STATE);
      clearCookie(res, COOKIE_VERIFIER);
      return res.status(403).send(`A conta @${user.login} não tem permissão para este blog.`);
    }

    const session = sealSession({
      accessToken: tokenData.access_token,
      login: user.login,
      avatarUrl: user.avatar_url || null,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });

    setCookie(res, serializeCookie(COOKIE_SESSION, session, { maxAge: 8 * 60 * 60 }));
    clearCookie(res, COOKIE_STATE);
    clearCookie(res, COOKIE_VERIFIER);

    res.writeHead(302, { Location: '/blog/admin/' });
    res.end();
  } catch (error) {
    res.status(500).send(error.message || 'Falha ao concluir o login.');
  }
};
