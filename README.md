# Otávio Leite — Blog

Blog em Hugo com administração própria em `/blog/admin/`.

## Recursos

- Interface de administração própria, responsiva e no mesmo estilo do blog.
- Login via GitHub OAuth, restrito ao usuário `otavio-dias-leite`.
- Os posts são armazenados como Markdown em `content/posts/*.md`.
- Criar, editar, excluir e renomear posts.
- Data/hora local preenchida automaticamente com o momento atual.
- Slug automático, tags, categorias, descrição, capa e rascunho/publicado.
- Preview Markdown, barra de ferramentas, contador visual de status e rascunho local.
- Cada alteração gera commit no branch `main`; o GitHub Actions recompila o site público.
- Sessão em cookie HttpOnly, Secure e criptografado no backend.

## Autenticação

O login usa o fluxo OAuth web do GitHub com `state` e PKCE. O segredo do cliente fica apenas no backend (Vercel), nunca no navegador. A API também valida o login do GitHub antes de permitir leitura ou escrita dos posts.

### 1. Criar o OAuth App no GitHub

Em **Settings → Developer settings → OAuth Apps**, crie um OAuth App.

Use:

- Homepage URL: `https://SEU-DOMINIO/blog/`
- Authorization callback URL: `https://SEU-DOMINIO/api/auth/callback`
- Scope usado pelo projeto: `public_repo`

### 2. Configurar variáveis de ambiente na Vercel

Adicione as variáveis de `.env.example` no ambiente de produção (e Preview, quando necessário). Gere `SESSION_SECRET` com um valor aleatório forte, por exemplo:

```bash
openssl rand -hex 32
```

Não faça commit do segredo do GitHub ou do `SESSION_SECRET`.

### 3. Deploy

O projeto é estruturado para Vercel: Hugo gera o site público e as funções em `api/` fazem a autenticação e o CRUD no GitHub.

O endereço público fica em `/blog/` e o editor autenticado em `/blog/admin/`.

> O site público continua sendo derivado dos arquivos Markdown do repositório. O painel administrativo não transforma o Hugo em uma aplicação JavaScript pesada; ele apenas grava os arquivos do conteúdo no GitHub.

## GitHub Actions

O workflow original de GitHub Pages foi mantido como referência para o deploy do Hugo. Para usar o editor autenticado, publique este projeto em Vercel (ou em uma plataforma equivalente que execute as funções HTTP de `api/`).
