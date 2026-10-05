# Passos Manuais — o que o código não pôde fazer

Data: 2026-09-16

Todas as alterações de código já estão no projeto. Restam quatro ações que dependem de você.

## 1. 🔴 Rotacionar e limpar as credenciais do Mercado Pago (urgente)

A gravação do `.env.local` foi **recusada** pela política de acesso remoto — o arquivo continua com as credenciais de produção em texto plano:

```
ACCESS_TOKEN_MERCADO_PAGO=APP_USR-3785125423549519-082618-...
CLIENT_SECRET_MERCADO_PAGO=vKhsMoL7HJZsGkLxlZzHuw7Zwe6hJsaU
```

**Faça na ordem:**

1. Painel do Mercado Pago → Suas integrações → a aplicação `3785125423549519` → **renovar** access token, client secret e public key.
2. Substituir o conteúdo de `.env.local` por (é o que está em `.env.example`):

```env
VITE_SUPABASE_URL=https://mvseimdhaliupdgxmxrv.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_GgbIRalS1ZoYGG2f-6XTsg_ecjOoKOI
```

3. Verificar se o arquivo já foi commitado alguma vez:

```bash
git log --all --full-history -- .env.local
```

Se aparecer qualquer commit, as credenciais vazaram para o histórico — rotacionar é obrigatório e o histórico precisa ser reescrito (`git filter-repo`) ou o repositório considerado comprometido.

O `.gitignore` já foi atualizado para ignorar `.env` e `.env.*` (exceto `.env.example`).

## 2. Apagar `src/App.css`

Resíduo do template do Vite (`.counter`, `.vite`, `#next-steps`), e seu `.hero` colidia com o da Home. O `import` já foi removido de `App.jsx`, então o arquivo está morto — as ferramentas remotas não podem apagá-lo.

```bash
rm src/App.css
```

## 3. Aplicar a migration no Supabase

Rodar **antes** as quatro consultas de verificação de `docs/PLANO_SCHEMA_SUPABASE.md` §7 (duplicatas, status fora do domínio, autores sem `is_autor`, estado das colunas). Depois:

```bash
supabase link --project-ref mvseimdhaliupdgxmxrv
supabase db dump > backup-pre-migration.sql      # backup
supabase db push
supabase db dump --schema public --data-only=false > supabase/schema.sql
```

### Múltiplas categorias por obra (`20260924120000_multiplas_categorias_por_obra.sql`)

**Ordem obrigatória: migration primeiro, front depois.** O front novo lê `obra_categorias(...)`; publicado antes da migration, todas as telas que listam obras falham (PGRST200). O contrário é seguro: o front antigo continua funcionando com a migration aplicada (testado), porque `obras.categoria_id` segue existindo como a categoria principal e um trigger mantém a junção em sincronia.

Se aplicar pelo SQL Editor em vez de `db push`, cole o arquivo inteiro de uma vez e, se as telas não enxergarem a tabela nova de imediato, rode `NOTIFY pgrst, 'reload schema';`.

### Colofão nos arquivos (`20261005120000_colofao_e_links_curtos.sql` + `gerar_arquivo_final`)

Toda obra em PDF/EPUB passa a ser distribuída com uma página final de créditos (link curto `<site>/o/<codigo>`, Pague Depois e 90/10). O arquivo do autor fica preservado em `arquivo_original_url`.

**Antes de tudo: o `SITE_URL` precisa ser o domínio definitivo.** O link impresso no colofão usa `SITE_URL` e fica congelado em todas as cópias que circularem; trocar de domínio depois quebra esses links.

Ordem:

```bash
supabase db push                                   # links_obra + arquivo_original_url
supabase functions deploy gerar_arquivo_final      # precisa estar no ar antes do front novo
# publicar o front

# Aplicar o colofão às obras já publicadas (reprocessa a partir dos originais):
supabase secrets set COLOFAO_ADMIN_SECRET="<valor aleatório>"
curl -X POST "https://mvseimdhaliupdgxmxrv.supabase.co/functions/v1/gerar_arquivo_final" \
  -H "x-colofao-admin: <mesmo valor>" -H "Content-Type: application/json" -d '{}'
supabase secrets unset COLOFAO_ADMIN_SECRET        # o modo admin deixa de existir
```

O mesmo reprocessamento serve para quando o texto do colofão mudar: as obras novas e reprocessadas saem com o texto novo; cópias que já circulam não mudam.

Testes do módulo (Deno): `deno test --node-modules-dir=none --allow-read --allow-env --allow-net supabase/functions/_shared/colofao_test.ts`

## 4. Configurar secrets e publicar as Edge Functions

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="<token rotacionado>"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="<painel MP → Webhooks>"
supabase secrets set SITE_URL="https://<seu-dominio>"
supabase secrets set ALLOWED_ORIGINS="https://<seu-dominio>"

supabase functions deploy create_preference
supabase functions deploy webhook_mercadopago --no-verify-jwt
```

`--no-verify-jwt` no webhook é obrigatório (o Mercado Pago não envia JWT do Supabase). A proteção do endpoint passa a ser a validação de `x-signature`, já implementada — por isso `MERCADOPAGO_WEBHOOK_SECRET` **não é opcional**: sem ele a função recusa toda notificação com HTTP 500.

Cadastrar no painel MP → Webhooks → tópico *Pagamentos*:

```
https://mvseimdhaliupdgxmxrv.supabase.co/functions/v1/webhook_mercadopago
```

### Em desenvolvimento local

```bash
supabase secrets set SITE_URL="http://localhost:5173"
```

`http://localhost` é aceito pela função; qualquer outro `http://` é rejeitado, porque o Mercado Pago recusa `auto_return` sem HTTPS.

## 5. Testes antes do go-live

| Cenário | Esperado |
|---|---|
| Visitante acessa `/painel` | redireciona para `/login` |
| Leitor (sem `is_autor`) acessa `/painel` | redireciona para `/` |
| Autor acessa `/painel` | vê **apenas** as próprias obras; "Ganhos Totais" soma só as dele |
| Contribuição R$ 0 | registra acesso, vai para `/sucesso?obra_id=...` |
| Contribuição paga com cartão aprovado | `/sucesso?request_id=...` mostra "Confirmando…" e vira "confirmada" |
| Pix pendente | tela mostra "em processamento", obra aparece na biblioteca após o webhook |
| Cartão recusado | volta para `/obra/:id?error=payment_failed` com aviso |
| Webhook reenviado 5× | uma única linha em `transacoes` |
| POST no webhook sem `x-signature` | HTTP 401, linha em `webhook_eventos` com `assinatura_ok = false` |
| Largura 320px | sem scroll horizontal em nenhuma página |
