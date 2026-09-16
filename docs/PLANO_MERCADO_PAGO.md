# Diagnóstico e Plano de Implantação — Gateway Mercado Pago

Data: 2026-09-16 · Projeto Supabase: `mvseimdhaliupdgxmxrv`

## 1. Situação atual

A integração **existe e está ~60% pronta**, com arquitetura correta (Checkout Pro + webhook server-side que reconsulta a API do MP). Mas **não funciona ponta a ponta**: há três bugs que quebram o fluxo de pagamento real e uma exposição de credenciais que exige ação imediata.

Componentes presentes:

| Componente | Arquivo | Estado |
|---|---|---|
| Criação de preferência | `supabase/functions/create_preference/index.ts` | funcional com ressalvas |
| Webhook de confirmação | `supabase/functions/webhook_mercadopago/index.ts` | **quebrado** (coluna inexistente, sem assinatura) |
| Chamada do frontend | `src/pages/BookDetails.jsx` → `handlePayment` | funcional |
| Retorno pós-pagamento | `src/pages/Success.jsx` | **quebrado** (lê parâmetro errado) |
| Registro de transação | `transacoes` | schema divergente |
| Split 90/10 | — | **inexistente** (apenas visual) |

## 2. Diagnóstico por severidade

### 🔴 P0-1 — Credenciais de produção expostas

`.env.local` contém, em texto plano:

```
ACCESS_TOKEN_MERCADO_PAGO=APP_USR-3785125423549519-082618-...
CLIENT_SECRET_MERCADO_PAGO=vKhsMoL7HJZsGkLxlZzHuw7Zwe6hJsaU
CLIENT_ID_MERCADO_PAGO=3785125423549519
PUBLIC_KEY_MERCADO_PAGO=APP_USR-300df73a-...
```

O prefixo `APP_USR-` indica **credenciais de produção, não de teste**. Sem o prefixo `VITE_` elas não entram no bundle do navegador — o que evita o pior cenário — mas estão no disco de trabalho e a um `git add .` de vazarem. O access token permite criar pagamentos, consultar dados de compradores e movimentar a conta.

**Ação:** rotacionar as quatro credenciais no painel MP hoje; remover o bloco do `.env.local`; confirmar que `.env.local` está no `.gitignore` e que nunca foi commitado (`git log --all -p -- .env.local`).

### 🔴 P0-2 — Webhook grava coluna que não existe

`webhook_mercadopago/index.ts` insere `request_id`. O `schema.sql` não define essa coluna em `transacoes`. Se ela não existir no banco real, o insert falha, a função lança, retorna **500**, e o Mercado Pago entra em retry contínuo. Pagamento cobrado, obra não liberada.

### 🔴 P0-3 — Página de sucesso lê o parâmetro errado

`create_preference` monta:

```
success: `${siteUrl}/sucesso?request_id=${requestId}`
```

`Success.jsx` lê:

```js
const obraId = searchParams.get('obra_id');
```

Após um pagamento real, `obraId` é `null` → nenhuma query → tela exibe *"Não foi possível carregar os detalhes da obra (ID inválido)"*. O único caminho que hoje funciona na tela de sucesso é o download gratuito, que passa `?obra_id=` manualmente.

Além disso, `Success.jsx` consulta `url_capa`/`url_arquivo` enquanto o resto do app usa `capa_url`/`arquivo_url` (ver §2 do documento de documentação).

### 🔴 P0-4 — Webhook sem validação de assinatura

A função aceita qualquer POST. Mitigação parcial: ela reconsulta o pagamento na API do MP (`paymentClient.get`) e nunca confia no status recebido — isso bloqueia forja de aprovação. Porém o endpoint continua:

- enumerável (permite sondar IDs de pagamento de terceiros),
- abusável como vetor de DoS contra a API do MP e contra o banco (service role),
- não conforme com a exigência do Mercado Pago de validar `x-signature` + `x-request-id` com o `WEBHOOK_SECRET`.

### 🟠 P1-5 — Botão "Simular Pagamento" em produção

`BookDetails.jsx`, dentro do modal:

```jsx
<button onClick={handleSimulatePayment}>
  ⚡ Simular Pagamento e Concluir Download (Modo Dev)
</button>
```

Aparece sempre que `paymentError` é definido — inclusive por erro transitório de rede. Ao clicar, a obra é liberada com `valor_pago = 0`. Precisa estar atrás de `import.meta.env.DEV`.

### 🟠 P1-6 — Split 90/10 não implementado

A regra de negócio central da plataforma é decorativa. `create_preference` cria uma preferência simples: **100% do valor cai na conta da plataforma**. Não há `marketplace_fee`, não há `collector_id` do autor, não há registro de valor devido ao autor, e `usuarios.chave_pix` nunca é lida. O repasse é hoje um processo manual inexistente.

### 🟠 P1-7 — `auto_return: 'approved'` sem HTTPS

`SITE_URL` cai para `http://localhost:5173` quando não definida. O Mercado Pago rejeita `auto_return` com `back_urls` não-HTTPS em produção — erro na criação da preferência.

### 🟠 P1-8 — Pix excluído na prática

```js
payment_methods: { excluded_payment_types: [{ id: "ticket" }], installments: 1 }
```

Remove boleto, mantém Pix e cartão. Porém `agent.md` define Pix como método **prioritário** e o MVP usa Checkout Pro redirecionado — o Pix aparece dentro do fluxo do MP, sem QR Code embutido na plataforma. Não é bug, é uma decisão de produto a revisitar.

### 🟡 P2 — Demais pontos

| # | Item |
|---|---|
| 9 | Sem idempotência na criação de preferência (`X-Idempotency-Key`) — duplo clique gera duas preferências. |
| 10 | Webhook trata só `status === 'approved'`. Pix pendente, estorno (`refunded`), contestação (`charged_back`) e cancelamento são ignorados. |
| 11 | Sem tabela de auditoria de eventos do webhook — impossível reconciliar. |
| 12 | `transacoes` não tem coluna `metodo_pagamento`, `valor_autor`, `valor_plataforma` nem `status_repasse`. |
| 13 | Sem constraint `UNIQUE(gateway_id)` — a deduplicação é feita por `SELECT` antes do `INSERT`, sujeita a corrida em notificações simultâneas. |
| 14 | `create_preference` não valida a sessão via JWT: confia no `user_id` do body. Um cliente pode atribuir a contribuição a outro usuário. |
| 15 | `create_preference` não valida se `obra_id` existe nem lê o preço no banco — aceita qualquer valor enviado pelo cliente. |
| 16 | Sem `notification_url` explícita na preferência (depende da config no painel MP). |
| 17 | `@mercadopago/sdk-react` instalado e nunca usado — remover ou usar para Payment Brick. |
| 18 | Sem ambiente de sandbox separado (credenciais de teste). |
| 19 | Timeout de 5s no cliente MP sem retry. |
| 20 | Webhook retorna 500 em exceção — MP faz retry, mas erro permanente gera fila infinita. Precisa de DLQ ou 200 + log. |

## 3. Plano de implantação

### Fase 0 — Contenção (hoje, 2h)

| # | Ação |
|---|---|
| 0.1 | Rotacionar access token, client secret, public key e client ID no painel MP. |
| 0.2 | Remover as quatro variáveis MP do `.env.local`. |
| 0.3 | Verificar histórico git: `git log --all --full-history -- .env.local`. Se houve commit, reescrever histórico ou considerar o repo comprometido. |
| 0.4 | Criar credenciais de **teste** para desenvolvimento. |
| 0.5 | Gravar o novo token só como secret: `supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...`. |

### Fase 1 — Alinhar banco de dados (1 dia)

Migration `001_fix_transacoes.sql`:

```sql
-- alinhar nomes de colunas de obras ao que o frontend usa
-- (decidir o padrão; abaixo, adotando o do frontend)
ALTER TABLE public.obras RENAME COLUMN sinopse        TO descricao;
ALTER TABLE public.obras RENAME COLUMN preco_sugerido TO preco;
ALTER TABLE public.obras RENAME COLUMN url_capa       TO capa_url;
ALTER TABLE public.obras RENAME COLUMN url_arquivo    TO arquivo_url;

-- campos que a integração de pagamento exige
ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS request_id        UUID,
  ADD COLUMN IF NOT EXISTS metodo_pagamento  TEXT,
  ADD COLUMN IF NOT EXISTS valor_autor       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_plataforma  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS status_repasse    TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS gateway_payload   JSONB,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS transacoes_gateway_id_uniq
  ON public.transacoes (gateway_id) WHERE gateway_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transacoes_request_id_idx
  ON public.transacoes (request_id);

-- status de transação como domínio controlado
ALTER TABLE public.transacoes DROP CONSTRAINT IF EXISTS transacoes_status_chk;
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_status_chk
  CHECK (status IN ('pendente','concluido','falhou','estornado','contestado'));

-- auditoria de webhook
CREATE TABLE IF NOT EXISTS public.webhook_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway      TEXT NOT NULL DEFAULT 'mercadopago',
  evento_tipo  TEXT,
  payment_id   TEXT,
  assinatura_ok BOOLEAN,
  payload      JSONB,
  processado   BOOLEAN DEFAULT false,
  erro         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.webhook_eventos ENABLE ROW LEVEL SECURITY;
-- sem policy: acessível apenas via service role
```

Depois: atualizar `schema.sql` para refletir o banco real e passar a versionar migrations em `supabase/migrations/`.

### Fase 2 — Corrigir o fluxo (2 dias)

**2.1 `create_preference`**
- Validar o JWT do usuário a partir do header `Authorization` em vez de confiar no `user_id` do body.
- Buscar a obra no banco (`id`, `titulo`, `autor_id`, `preco`) e usar esses dados — nunca o `titulo` enviado pelo cliente.
- Validar valor: `> 0`, `<= 10000`, duas casas decimais.
- Gravar uma transação `status = 'pendente'` com o `request_id` **antes** de redirecionar.
- Enviar `notification_url` explícita apontando para a função de webhook.
- Adicionar `external_reference = request_id` (além de `metadata`), pois é o campo que o MP sempre devolve.
- Incluir `obra_id` nas `back_urls` de sucesso: `?request_id=...&obra_id=...`.
- Exigir `SITE_URL` HTTPS em produção; sem ela, falhar explicitamente em vez de cair para localhost.
- Enviar `X-Idempotency-Key: requestId`.
- Restringir CORS de `*` para o domínio do site.

**2.2 `webhook_mercadopago`**
- Validar `x-signature` / `x-request-id` com `MERCADOPAGO_WEBHOOK_SECRET` (HMAC-SHA256 sobre o template `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`). Rejeitar com 401 quando inválido.
- Registrar todo evento em `webhook_eventos` antes de processar.
- Fazer `UPDATE` da transação pendente por `request_id` / `external_reference`, com `INSERT` como fallback (`upsert` por `gateway_id`).
- Tratar os estados: `approved` → `concluido`; `pending`/`in_process` → `pendente`; `rejected`/`cancelled` → `falhou`; `refunded` → `estornado`; `charged_back` → `contestado`.
- Calcular e gravar `valor_autor` (90%) e `valor_plataforma` (10%).
- Gravar `metodo_pagamento` (`payment_type_id`) e `gateway_payload`.
- Retornar sempre 200 para eventos já processados ou não aplicáveis; reservar não-200 apenas para falhas transitórias reais.

**2.3 `Success.jsx`**
- Ler `request_id` (e `obra_id` quando presente).
- Buscar a transação por `request_id` e, a partir dela, a obra.
- Polling curto (5 tentativas / 2s) enquanto `status = 'pendente'`, com mensagem "confirmando seu pagamento".
- Corrigir os nomes de coluna para `capa_url`/`arquivo_url`.
- Botão de download só com `arquivo_url` real — remover o `alert('Download simulado concluído!')`.

**2.4 `BookDetails.jsx`**
- Envolver o botão de simulação em `{import.meta.env.DEV && ...}`.
- Exigir login **antes** de abrir o modal de contribuição.
- Bloquear duplo clique no botão de pagamento.
- Substituir `alert()` por feedback em tela.

### Fase 3 — Split e repasse (3 dias)

Decidir o modelo. Duas opções:

**Opção A — Marketplace do Mercado Pago (recomendada)**
O autor conecta a própria conta MP via OAuth. A plataforma cria a preferência com o token do autor e cobra `marketplace_fee = 10%`. O dinheiro vai direto para o autor; a plataforma recebe a taxa automaticamente.
- Prós: repasse automático, sem risco de caixa, sem obrigação de custódia.
- Contras: exige onboarding OAuth por autor (`/oauth/token`, armazenar `refresh_token`), e autores sem conta MP não podem receber.

**Opção B — Custódia + repasse manual/Pix**
Todo valor entra na conta da plataforma; o sistema acumula `valor_autor` e um job faz repasse por Pix usando `usuarios.chave_pix`.
- Prós: onboarding trivial para o autor.
- Contras: a plataforma vira intermediária financeira (implicações fiscais e regulatórias), precisa de controle de saldo, e o repasse é operação manual ou via API de transferências.

Entregas comuns às duas opções:
- Tabela `repasses` (`autor_id`, `periodo`, `valor`, `status`, `comprovante`).
- Tela de configuração de recebimento no Painel do Autor.
- Relatório de ganhos por obra e por período — corrigindo o bug de `fetchGanhos` somar as transações de **todos** os autores.
- Exibição do split real (valor líquido ao autor após taxa do MP), não só o 90/10 bruto.

### Fase 4 — Testes e go-live (2 dias)

| # | Item |
|---|---|
| 4.1 | Criar aplicação de teste no MP; usuários de teste comprador e vendedor. |
| 4.2 | Cenários: Pix aprovado, Pix pendente→aprovado, Pix expirado, cartão aprovado, cartão recusado, estorno total, webhook duplicado, webhook com assinatura inválida, valor R$ 0 (fluxo gratuito), usuário deslogado. |
| 4.3 | Verificar idempotência: disparar o mesmo webhook 5× e confirmar uma única linha em `transacoes`. |
| 4.4 | Configurar o webhook no painel MP (produção) e validar entrega. |
| 4.5 | Definir `SITE_URL` com o domínio HTTPS de produção. |
| 4.6 | Teste de aceitação com valor real baixo (R$ 1,00) em produção. |
| 4.7 | Monitoramento: alerta sobre `webhook_eventos` com `processado = false` há mais de 15 min. |
| 4.8 | Runbook de reconciliação: consultar a API do MP e comparar com `transacoes`. |

## 4. Secrets necessários

Edge Functions (`supabase secrets set`):

```
MERCADOPAGO_ACCESS_TOKEN=       # token rotacionado, nunca no repositório
MERCADOPAGO_WEBHOOK_SECRET=     # do painel MP → Webhooks
SITE_URL=https://<dominio>      # HTTPS obrigatório para auto_return
SUPABASE_URL=                   # injetado automaticamente
SUPABASE_SERVICE_ROLE_KEY=      # injetado automaticamente
```

Frontend (`.env.local`) — **somente** chaves públicas:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Nenhuma credencial do Mercado Pago pertence ao frontend neste desenho (Checkout Pro redirecionado). A `PUBLIC_KEY` só seria necessária se adotado o Payment Brick embutido.

## 5. Cronograma

| Fase | Duração | Dependência | Resultado |
|---|---|---|---|
| 0 — Contenção | 2h | — | credenciais seguras |
| 1 — Banco | 1 dia | Fase 0 | schema alinhado e auditável |
| 2 — Correção do fluxo | 2 dias | Fase 1 | **pagamento funcional ponta a ponta** |
| 3 — Split e repasse | 3 dias | Fase 2 | regra de negócio 90/10 real |
| 4 — Testes e go-live | 2 dias | Fase 3 | produção monitorada |

**Total: ~8 dias úteis.** Pagamento funcional já ao fim da Fase 2 (~3 dias), com repasse ainda manual.

## 6. Sequência de comandos

```bash
# Fase 0
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="<novo>"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="<do painel>"
supabase secrets set SITE_URL="https://<dominio>"

# Fase 1
supabase migration new fix_transacoes   # colar o SQL da Fase 2
supabase db push

# Fase 2
supabase functions deploy create_preference
supabase functions deploy webhook_mercadopago --no-verify-jwt

# URL a cadastrar no painel MP → Webhooks → Pagamentos
# https://mvseimdhaliupdgxmxrv.supabase.co/functions/v1/webhook_mercadopago
```

> `--no-verify-jwt` é obrigatório no webhook (o MP não envia JWT do Supabase). Por isso a validação de `x-signature` da Fase 2.2 é indispensável: sem ela o endpoint fica totalmente aberto.
