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
