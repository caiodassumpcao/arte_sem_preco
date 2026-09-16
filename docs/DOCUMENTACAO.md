# Documentação do Software — Arte sem Preço

Versão do documento: 1.0 · Data: 2026-09-16 · Baseado no código em `/home/caiodassumpcao/Projetos/arte_sem_preco`

## 1. Visão geral

Biblioteca digital de acesso aberto onde o leitor obtém a obra sem pagamento obrigatório e contribui voluntariamente com o valor que quiser. Split declarado: 90% autor / 10% plataforma.

SPA React servida estaticamente, com Supabase como backend (Auth + Postgres + Storage + Edge Functions) e Mercado Pago Checkout Pro como gateway.

## 2. Stack real (conforme `package.json`)

| Camada | Tecnologia | Versão |
|---|---|---|
| UI | React | 19.2 |
| Build | Vite + `@vitejs/plugin-react` | 8.2 |
| Bundle | `vite-plugin-singlefile` | 2.3 |
| Rotas | react-router-dom | 7.18 |
| Ícones | lucide-react | 1.33 |
| Backend | @supabase/supabase-js | 2.112 |
| Pagamento | @mercadopago/sdk-react (declarado, **não usado no código**) | 1.0.7 |
| Lint | oxlint | 1.75 |

**Divergência com o README:** o README declara Tailwind CSS. Tailwind **não está instalado**. O projeto usa CSS puro com um mini-conjunto de utilitários escrito à mão em `src/index.css`.

## 3. Estrutura de diretórios

```
src/
├── main.jsx                 # bootstrap React (StrictMode)
├── App.jsx                  # AuthProvider + Router + layout
├── index.css                # design tokens + utilitários globais
├── App.css                  # RESÍDUO do template Vite (não utilizado)
├── lib/supabase.js          # client Supabase + diagnóstico em console
├── contexts/AuthContext.jsx # sessão, login, register, logout
├── data/mockData.js         # obras e ONGs mockadas (fallback)
├── components/
│   ├── Header.jsx           # navegação + menu de usuário
│   ├── Footer.jsx
│   ├── BookCard.jsx         # card de obra + favoritar
│   └── OngsTicker.jsx       # marquee de ONGs (dados mock)
└── pages/
    ├── Home.jsx             # hero, destaques, Arte que Transforma, curador
    ├── Catalog.jsx          # listagem + busca + filtro de categoria
    ├── Authors.jsx          # listagem de autores
    ├── BookDetails.jsx      # obra + widget de contribuição + checkout
    ├── Library.jsx          # "Minha Biblioteca" (salvas / apoiadas)
    ├── Dashboard.jsx        # painel do autor + publicação de obra
    ├── Login.jsx / Register.jsx
    └── Success.jsx          # retorno pós-pagamento
supabase/
├── schema.sql               # usuarios, categorias, causas, obras, transacoes + RLS
├── storage.sql              # bucket 'obras' + policies
├── trigger_new_user.sql     # cria perfil ao criar usuário no Auth
└── functions/
    ├── create_preference/   # Edge Function: cria preferência MP
    └── webhook_mercadopago/ # Edge Function: confirma pagamento
```

## 4. Rotas

| Rota | Componente | Protegida? |
|---|---|---|
| `/` | Home | não |
| `/catalogo` | Catalog | não |
| `/autores` | Authors | não |
| `/obra/:id` | BookDetails | não |
| `/sucesso` | Success | não |
| `/minha-biblioteca` | Library | **não** (trata ausência de sessão internamente) |
| `/painel` | Dashboard | **não** (falha grave — ver §8) |
| `/login`, `/cadastro` | Login / Register | não |

Não existe componente de rota protegida. Não existe rota 404.

## 5. Modelo de dados (`supabase/schema.sql`)

**usuarios** — `id` (FK `auth.users`), `nome`, `email`, `is_autor`, `chave_pix`, `created_at`
**categorias** — `id`, `nome`, `slug`
**causas** — `id`, `nome`, `descricao`
**obras** — `id`, `autor_id`, `titulo`, `sinopse`, `categoria_id`, `causa_id`, `preco_sugerido`, `url_capa`, `url_arquivo`, `tags[]`, `created_at`
**transacoes** — `id`, `usuario_id`, `obra_id`, `valor_pago`, `status`, `gateway_id`, `created_at`

RLS habilitado em `usuarios`, `obras` e `transacoes`. Storage: bucket público `obras`, upload permitido a qualquer autenticado.

> **Incompatibilidade crítica de schema.** O frontend consulta campos que não existem no `schema.sql`:
>
> | Frontend usa | Schema define |
> |---|---|
> | `obras.descricao` | `obras.sinopse` |
> | `obras.preco` | `obras.preco_sugerido` |
> | `obras.capa_url` | `obras.url_capa` |
> | `obras.arquivo_url` | `obras.url_arquivo` |
> | `transacoes.request_id` | *(não existe)* |
>
> `Success.jsx` é o único arquivo que usa os nomes do `schema.sql` (`url_capa`, `url_arquivo`). Conclusão: o banco em produção divergiu do `schema.sql` versionado, e `Success.jsx` ficou para trás. **O `schema.sql` não reflete o banco real e não pode ser usado para recriar o ambiente.**

## 6. Autenticação

`AuthContext` expõe `user`, `login`, `register`, `logout`.

- Sessão lida via `getSession()` + assinatura de `onAuthStateChange`.
- `register` grava metadata `{ nome, is_autor }` e faz `upsert` em `public.usuarios` quando há sessão imediata; sem sessão (confirmação de e-mail ativa), o trigger `handle_new_user` cria o perfil.
- `login` tem uma rede de segurança: se o perfil não existe em `public.usuarios`, cria pós-login.
- Renderização é bloqueada até `loading = false` (`{!loading && children}`) — nenhum conteúdo aparece antes da checagem de sessão.

## 7. Fluxos funcionais

### 7.1 Acesso gratuito (contribuição = R$ 0)
`BookDetails` → `handleDirectDownload` → exige login → insere `transacoes` (`valor_pago = 0`, `status = 'concluido'`) → redireciona para `/sucesso?obra_id=...&status=approved`.

### 7.2 Pague depois
Botão de coração → insere a mesma transação com valor 0. A obra aparece na aba "Salvas para Pagar Depois" da Biblioteca.

### 7.3 Contribuição paga
`handlePayment` → `supabase.functions.invoke('create_preference')` → Edge Function cria preferência no MP com `metadata { obra_id, user_id, request_id }` → frontend redireciona para `init_point` → MP devolve para `/sucesso?request_id=...` → webhook consulta o pagamento na API do MP e insere a transação com `status = 'concluido'`.

O split 90/10 é **apenas visual** (`contribution * 0.9` em tela). Não há repasse implementado.

### 7.4 Publicação de obra (`Dashboard`)
Upload de capa e arquivo ao bucket `obras` (`getPublicUrl`) → insert em `obras` com `autor_id = session.user.id`.

### 7.5 Biblioteca
Query em `transacoes` do usuário com join em `obras`. Classificação: `valor_pago > 0` → "Apoiadas"; `= 0` → "Salvas". Deduplicação por `id` em memória.

## 8. Defeitos e riscos identificados

### Críticos

1. **Credenciais de produção do Mercado Pago em texto plano** em `.env.local` (`ACCESS_TOKEN_MERCADO_PAGO`, `CLIENT_SECRET_MERCADO_PAGO`, prefixo `APP_USR-`). Sem prefixo `VITE_` não vão para o bundle, mas estão no disco e sujeitas a commit acidental. **Rotacionar imediatamente.**
2. **`/painel` sem proteção e sem filtro de autor.** `fetchObras()` faz `select('*')` em `obras` sem `.eq('autor_id', ...)`. Qualquer visitante vê todas as obras da plataforma como "Suas Obras", e "Ganhos Totais" soma as transações de todas as obras de todos os autores.
3. **Schema divergente** (§5) — quebra `Success.jsx` e impossibilita recriar o ambiente pelo SQL versionado.
4. **Webhook do MP sem validação de assinatura** (`x-signature` / `x-request-id`). Endpoint público que grava em `transacoes` com service role.
5. **Webhook insere `request_id`, coluna inexistente no `schema.sql`.** Se a coluna não existir no banco real, todo pagamento aprovado falha no insert (retorna 500 → MP reprocessa indefinidamente).
6. **`Success.jsx` incompatível com o retorno real do MP.** As `back_urls` enviam `?request_id=`, mas a página lê `?obra_id=`. Após um pagamento real, a tela mostra "Não foi possível carregar os detalhes da obra".

### Altos

7. **Botão "Simular Pagamento (Modo Dev)"** exposto no modal de produção. Ao aparecer qualquer erro de pagamento, o usuário libera a obra com `valor_pago = 0`.
8. **Arquivos das obras em bucket público** com URL permanente e sem rastreio de acesso. Qualquer URL vazada distribui a obra fora da plataforma.
9. **Storage sem restrição por autoria no INSERT** — qualquer autenticado pode subir arquivos no bucket `obras`.
10. **Sem controle de autoria na publicação** — `is_autor` não é verificado em nenhum ponto.
11. **`Library` e `BookCard` não filtram `status`** de forma consistente (`BookCard` omite `.eq('status','concluido')`).
12. **`maybeSingle()` em `transacoes`** com `usuario_id` + `obra_id`: se houver mais de uma linha (salvou e depois contribuiu), a query retorna erro.

### Médios

13. Logs verbosos em produção: `console.log` de objetos `user`, e-mails e IDs de sessão em `AuthContext`, `supabase.js`, `Dashboard`, `Library`, `BookDetails`.
14. `VITE_SUPABASE_ANON_KEY` usa o formato novo (`sb_publishable_...`), mas `supabase.js` valida esperando JWT (`eyJ...`) e emite erro falso no console.
15. `vite-plugin-singlefile` + `BrowserRouter`: inlina todo JS/CSS em `index.html` (perde cache por arquivo) e deep links exigem rewrite no host.
16. `App.css` é resíduo do template Vite (`.counter`, `.vite`, `#next-steps`) — código morto, com `.hero` colidindo com `Home.css`.
17. Colisões de CSS global: `.search-input` (Catalog vs Authors), `.modal-overlay`/`.modal-content` (BookDetails vs Dashboard), `.badge`/`.badge-accent` (index vs Dashboard). O vencedor depende da ordem de import.
18. `src/assets/placeholder.png` tem 678 KB e é usado como fallback de capa.
19. Fallbacks `'/src/assets/placeholder.png'` não resolvem no build de produção.
20. `mockData` como fallback silencioso: em falha de rede o catálogo exibe obras fictícias como se fossem reais.
21. UX de feedback por `alert()` em `BookDetails`.
22. `@mercadopago/sdk-react` instalado e nunca importado.
23. Dashboard estilizado em paleta dark hardcoded + `style` inline, fora do sistema de tokens do resto da aplicação.
24. Sem testes automatizados (`test_auth.mjs` é script manual solto na raiz).

## 9. Como executar

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ em arquivo único
npm run lint         # oxlint
```

Variáveis necessárias em `.env.local`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Segredos do Mercado Pago **não** pertencem ao `.env.local` — devem ficar apenas em secrets das Edge Functions (`MERCADOPAGO_ACCESS_TOKEN`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## 10. Deploy

- **Frontend:** build estático (Vercel / Cloudflare Pages / Nginx). Requer rewrite de todas as rotas para `index.html`.
- **Backend:** `supabase db push` (após corrigir o schema) + `supabase functions deploy create_preference webhook_mercadopago`.
- Projeto Supabase vinculado: `mvseimdhaliupdgxmxrv`.
