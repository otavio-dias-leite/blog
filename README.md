# Otávio Leite — Blog

Blog em Hugo com painel administrativo próprio em `/admin/` (compatível também com `/blog/admin/`).

## Recursos

- Interface de administração própria, responsiva e no mesmo estilo do blog.
- Login via GitHub OAuth, restrito ao usuário `otavio-dias-leite`.
- Os posts são armazenados como Markdown em `content/posts/*.md`.
- Criar, editar, excluir e renomear posts.
- Data/hora local preenchida automaticamente com o momento atual.
- Slug automático, tags, categorias, descrição, capa e rascunho/publicado.
- Editor Markdown com pré-visualização, tabelas, listas, blocos de código, upload de imagens e incorporação de YouTube, Vimeo e vídeos hospedados.
- Painel responsivo com criação, edição, publicação como rascunho, exclusão, renomeação, busca e restauração de rascunho local.
- Cada alteração gera commit no branch `main`; o GitHub Actions recompila o site público.
- Sessão em cookie HttpOnly, Secure e criptografado no backend.
- Conteúdo multilíngue: posts podem ser escritos em qualquer idioma; o idioma de origem é detectado automaticamente e o visitante escolhe inglês ou português.
- Inglês é o idioma padrão para novas visitas; a preferência escolhida fica salva no navegador.

## Idiomas e tradução automática

O seletor no cabeçalho oferece **EN-US** e **PT-BR**. O inglês é o padrão. Ao abrir um post, o blog traduz seu conteúdo para o idioma selecionado, mesmo quando o texto original foi escrito em outro idioma.

A detecção e a tradução são feitas sob demanda pelo serviço público LibreTranslate (instância Argos Open Tech). O resultado é armazenado no navegador para evitar traduzir novamente o mesmo trecho. Se o serviço estiver indisponível, o post permanece acessível no idioma original.

Para indicar explicitamente o idioma de um post, adicione `lang` ao front matter:

```yaml
---
title: "Um post em português"
lang: "pt-BR"
---
```

Idiomas aceitos como origem incluem códigos ISO 639-1, como `en`, `pt-BR`, `es`, `fr` e `de`. Se `lang` for omitido, a API recebe a origem como `auto` e detecta o idioma. Não é necessário criar duas versões do mesmo post.

## Editor, Markdown e mídia

Acesse `/admin/` e entre com a conta GitHub `@otavio-dias-leite`. O painel permite criar posts, editar, renomear, salvar como rascunho, publicar, buscar e excluir. O conteúdo é salvo como Markdown em `content/posts/`; cada ação cria um commit no GitHub.

O editor inclui pré-visualização, títulos, negrito, itálico, listas, listas de tarefas, citações, código, tabelas, links e imagens. Imagens podem ser enviadas pelo painel (JPG, PNG, WebP, GIF ou AVIF, até 2,5 MB); elas são guardadas em `static/uploads/` e inseridas automaticamente no post.

Para vídeos, use os botões YouTube ou Vimeo no editor, ou insira os shortcodes manualmente:

```md
{{< youtube id="dQw4w9WgXcQ" >}}

{{< vimeo id="76979871" >}}

{{< video src="https://example.com/video.mp4" >}}
```

Os vídeos incorporados são renderizados em players responsivos. Para uploads de imagem, a rota `/api/media` exige uma sessão GitHub válida.

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

O endereço público fica em `/blog/` e o editor autenticado em `/admin/` (o endereço legado `/blog/admin/` também é aceito).

> O site público continua sendo derivado dos arquivos Markdown do repositório. O painel administrativo não transforma o Hugo em uma aplicação JavaScript pesada; ele apenas grava os arquivos do conteúdo no GitHub.

## GitHub Actions

O workflow original de GitHub Pages foi mantido como referência para o deploy do Hugo. Para usar o editor autenticado, publique este projeto em Vercel (ou em uma plataforma equivalente que execute as funções HTTP de `api/`).
