const {
  COOKIE_STATE,
  COOKIE_VERIFIER,
  callbackUrl,
  randomString,
  requireEnv,
  serializeCookie,
  setCookie,
  sha256,
} = require('../_lib/auth');

module.exports = async function handler(req, res) {
  try {
    requireEnv();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

    const state = randomString(32);
    const verifier = randomString(48);
    const challenge = sha256(verifier).toString('base64url');
    const redirectUri = callbackUrl(req);

    setCookie(res, serializeCookie(COOKIE_STATE, state, { maxAge: 600 }));
    setCookie(res, serializeCookie(COOKIE_VERIFIER, verifier, { maxAge: 600 }));

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'public_repo',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      allow_signup: 'false',
    });

    res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params.toString()}` });
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message || 'Falha ao iniciar o login.' });
  }
};
