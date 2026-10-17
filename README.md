# Otávio Leite — Blog

Blog estático em Hugo, com tema preto/vermelho e painel administrativo em `/blog/admin/`.

## Painel administrativo

O painel permite entrar com GitHub, listar publicações, criar posts, editar Markdown, salvar como rascunho, publicar e excluir arquivos em `content/posts/*.md`. Cada alteração gera um commit diretamente no branch configurado.

A autenticação usa GitHub OAuth com `state` e PKCE. O backend valida a identidade na API do GitHub e permite somente a conta `otavio-dias-leite`. O token OAuth fica criptografado em cookie HttpOnly, Secure em produção, e não é enviado ao JavaScript do painel.

### Configuração necessária

O GitHub Pages executa apenas arquivos estáticos e não consegue executar as rotas seguras de OAuth. O painel completo exige deploy do projeto em uma hospedagem que execute as funções Node.js, como Vercel. O arquivo `vercel.json` já configura o build do Hugo e as funções em `api/`.

1. Crie um OAuth App em GitHub → Settings → Developer settings → OAuth Apps.
2. Ative o fluxo OAuth web e use como callback `https://SEU-DOMINIO/api/auth/callback`.
3. Importe este repositório na Vercel e configure as variáveis de ambiente:

| Variável | Valor |
|---|---|
| `GITHUB_CLIENT_ID` | Client ID do OAuth App |
| `GITHUB_CLIENT_SECRET` | Client Secret do OAuth App |
| `SESSION_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `GITHUB_OWNER` | `otavio-dias-leite` |
| `GITHUB_REPO` | `blog` |
| `GITHUB_BRANCH` | `main` |
| `GITHUB_ALLOWED_LOGIN` | `otavio-dias-leite` |
| `GITHUB_CALLBACK_URL` | URL pública `/api/auth/callback` do domínio implantado |

Gere o segredo de sessão com:

```bash
openssl rand -hex 32
```

Conceda ao OAuth App o escopo `public_repo`. Não coloque Client Secret ou SESSION_SECRET no código ou em arquivos versionados. Configure os mesmos valores nos ambientes Production e Preview que forem usados.

Após o deploy, abra `https://SEU-DOMINIO/blog/admin/`. A conta GitHub autorizada é exclusivamente `@otavio-dias-leite`; qualquer outra conta recebe acesso negado. O endereço antigo do GitHub Pages não executa as funções de autenticação, a menos que o domínio seja apontado para a implantação com backend.

## Languages and static translations

English is the canonical authoring language for every post and page. During each deployment, the build generates complete static HTML copies for Brazilian Portuguese, Spanish, Simplified Chinese, and Japanese under `/pt-br/`, `/es/`, `/zh-cn/`, and `/ja/`.

Visitors are routed to the prebuilt version based on their detected country, with browser language as a fallback. The selected locale is cached in the browser for 24 hours. The site does not translate page content during normal navigation; each localized route is already generated before deployment. A build-time translation cache avoids retranslating unchanged text on later deployments.

Write new posts in English and keep their front matter language set to `en`. The generated localized pages preserve the original HTML structure and leave scripts, styles, code blocks, and technical snippets untouched.

## Editor Markdown e mídia

O editor oferece títulos, negrito, listas, código, links, pré-visualização e shortcode de YouTube. Os posts são salvos como Markdown e o Hugo os publica no build seguinte.

Shortcodes de vídeo disponíveis:

```md
{{< youtube id="dQw4w9WgXcQ" >}}
{{< vimeo id="76979871" >}}
{{< video src="https://example.com/video.mp4" >}}
```

## Desenvolvimento local

Instale Hugo Extended e execute:

```bash
hugo server
```

As funções OAuth não funcionam no servidor local sem as variáveis de ambiente e um endpoint público de callback OAuth.
