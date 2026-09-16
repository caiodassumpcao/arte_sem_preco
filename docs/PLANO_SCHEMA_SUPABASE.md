# Plano de Adequação e Coordenação — Projeto ↔ Supabase

Data: 2026-09-16 · Projeto: `mvseimdhaliupdgxmxrv`

## 1. O problema

O banco foi alterado direto pelo painel do Supabase. O `supabase/schema.sql` versionado ficou congelado no estado inicial. Hoje há duas "verdades" divergentes:

| Coluna no frontend (banco real) | Coluna no `schema.sql` versionado |
|---|---|
| `obras.descricao` | `obras.sinopse` |
| `obras.preco` | `obras.preco_sugerido` |
| `obras.capa_url` | `obras.url_capa` |
| `obras.arquivo_url` | `obras.url_arquivo` |
| `transacoes.request_id` | *(inexistente)* |

Consequências práticas: ninguém consegue recriar o ambiente a partir do repositório, `Success.jsx` ficou com os nomes antigos e quebrou, e não há como saber se uma coluna existe sem abrir o painel.

Causa raiz: o `schema.sql` é um *dump inicial*, não um histórico de migrations. Qualquer edição no painel o invalida silenciosamente.

## 2. Padrão adotado

**O banco real é a verdade; o repositório passa a persegui-lo por migrations.**

Nomes canônicos (os que o frontend já usa em produção): `descricao`, `preco`, `capa_url`, `arquivo_url`. Renomear o banco para os nomes do SQL antigo exigiria mexer em 6 arquivos de frontend que funcionam — o custo é maior e o risco também.

## 3. Nova estrutura de arquivos

```
supabase/
├── migrations/                                  # NOVO — fonte da verdade versionada
│   └── 20260916120000_align_schema_and_payments.sql
├── schema.sql                                   # snapshot de referência, gerado, NÃO editado à mão
├── storage.sql                                  # idem
└── trigger_new_user.sql                         # idem
```

Regra: **nenhuma alteração de estrutura é feita pelo painel a partir de agora.** Toda mudança nasce como migration no repositório.

## 4. Adequação imediata (fase 1)

### 4.1 Aplicar a migration de alinhamento

A migration `20260916120000_align_schema_and_payments.sql` é **idempotente e defensiva**: cada bloco consulta `information_schema` antes de agir, então roda sem erro tanto num banco já alterado pelo painel quanto num banco recriado do zero.

```bash
supabase link --project-ref mvseimdhaliupdgxmxrv
supabase db push
```

O que ela faz:

1. Renomeia `sinopse → descricao`, `preco_sugerido → preco`, `url_capa → capa_url`, `url_arquivo → arquivo_url` — **apenas se** o nome antigo existir e o novo não.
2. `ADD COLUMN IF NOT EXISTS` para garantir todas as colunas do padrão.
3. Adiciona a `transacoes`: `request_id`, `metodo_pagamento`, `valor_autor`, `valor_plataforma`, `status_repasse`, `gateway`, `gateway_payload`, `updated_at`.
4. `CHECK` de domínio em `transacoes.status`.
5. Índices únicos: `gateway_id` (idempotência do webhook), `request_id` (idempotência da preferência), e `(usuario_id, obra_id)` para acesso gratuito — este último elimina o bug de `maybeSingle()` com múltiplas linhas.
6. Reescreve RLS: o cliente só insere transação com `valor_pago = 0` e `gateway_id IS NULL`. Contribuição paga entra exclusivamente pelo webhook (service role).
7. Separa a policy `FOR ALL` de `obras` em INSERT/UPDATE/DELETE, com `WITH CHECK` e exigência de `is_autor`.
8. Cria `webhook_eventos` (auditoria, sem policy — só service role).
9. Trigger de `updated_at`.
10. Restringe upload no Storage a usuários com `is_autor = true`.

### 4.2 Regenerar o snapshot

Depois do push, o `schema.sql` deixa de ser escrito à mão:

```bash
supabase db dump --schema public --data-only=false > supabase/schema.sql
```

Marcar no topo do arquivo: `-- GERADO AUTOMATICAMENTE. Não editar. Use supabase/migrations/.`

### 4.3 Gerar tipos para o frontend

```bash
supabase gen types typescript --project-id mvseimdhaliupdgxmxrv > src/types/database.ts
```

Mesmo em projeto JS, isso serve como documentação executável: qualquer divergência de nome de coluna fica visível em diff, não em erro de runtime.

## 5. Coordenação contínua (fase 2)

### 5.1 Fluxo de mudança de estrutura

```
1. Criar a migration            supabase migration new <nome>
2. Escrever o SQL               (idempotente: IF NOT EXISTS / IF EXISTS)
3. Testar local                 supabase db reset   # recria do zero e reaplica tudo
4. Ajustar o frontend           no mesmo commit da migration
5. Aplicar                      supabase db push
6. Regenerar snapshot e tipos   (passos 4.2 e 4.3)
7. Commit único                 migration + frontend + snapshot + tipos
```

O ponto crítico é o passo 4: **migration e código que a consome vão no mesmo commit.** Foi a separação entre os dois que produziu o estado atual.

### 5.2 Detecção de desvio

Script de verificação para rodar antes de cada deploy — falha se o banco divergir do repositório:

```bash
#!/usr/bin/env bash
# scripts/check-schema-drift.sh
set -euo pipefail
supabase db dump --schema public --data-only=false > /tmp/schema-atual.sql
if ! diff -q /tmp/schema-atual.sql supabase/schema.sql >/dev/null; then
  echo "DESVIO detectado entre o banco e supabase/schema.sql"
  diff -u supabase/schema.sql /tmp/schema-atual.sql || true
  exit 1
fi
echo "Schema em sincronia."
```

Rodar em CI (pull request) e no pre-push local.

### 5.3 Ambientes

| Ambiente | Projeto Supabase | Credenciais MP |
|---|---|---|
| Local | `supabase start` (Docker) | credenciais de teste |
| Staging | projeto separado | credenciais de teste |
| Produção | `mvseimdhaliupdgxmxrv` | credenciais de produção |

Hoje existe apenas produção — toda migration é testada direto no banco que atende usuários. Criar o projeto de staging é pré-requisito para as próximas mudanças estruturais.

### 5.4 Regra de convenção

Documentada aqui e verificável em revisão:

- Tabelas e colunas em `snake_case`, português.
- Sufixo de URL: `<coisa>_url` (`capa_url`, `arquivo_url`) — nunca `url_<coisa>`.
- FK: `<tabela_singular>_id` (`autor_id`, `obra_id`, `categoria_id`).
- Timestamps: `created_at`, `updated_at`, sempre `TIMESTAMPTZ DEFAULT now()`.
- Dinheiro: `NUMERIC(10,2)`, nunca `float`.
- Toda tabela com dado de usuário tem RLS habilitado e pelo menos uma policy explícita por operação.

## 6. Riscos da migration

| Risco | Mitigação |
|---|---|
| Renomeação quebra queries não mapeadas | Os blocos de rename são condicionais; se o banco já usa o nome novo, nada acontece. Antes do push, rodar `supabase db dump` e guardar como backup. |
| Índice único em `(usuario_id, obra_id)` falha por duplicatas pré-existentes | Rodar antes: `SELECT usuario_id, obra_id, count(*) FROM transacoes WHERE gateway_id IS NULL GROUP BY 1,2 HAVING count(*) > 1;` e consolidar as duplicatas. |
| `CHECK` de status falha por valor fora do domínio | Rodar antes: `SELECT DISTINCT status FROM transacoes;` |
| Nova policy de INSERT bloqueia usuários que não têm perfil em `usuarios` | O trigger `handle_new_user` cobre novos; para os antigos, `AuthContext.login` cria o perfil pós-login. |
| Restrição de upload a `is_autor` bloqueia autores marcados como leitores | Rodar antes: `SELECT id, email, is_autor FROM usuarios WHERE id IN (SELECT DISTINCT autor_id FROM obras);` e corrigir o flag. |

## 7. Checklist de aplicação

```sql
-- Executar ANTES do db push, no SQL Editor:

-- 1. Duplicatas que impedem o índice único
SELECT usuario_id, obra_id, count(*) FROM public.transacoes
WHERE gateway_id IS NULL GROUP BY 1,2 HAVING count(*) > 1;

-- 2. Status fora do domínio previsto
SELECT DISTINCT status FROM public.transacoes;

-- 3. Autores sem o flag is_autor
SELECT u.id, u.email, u.is_autor FROM public.usuarios u
WHERE u.id IN (SELECT DISTINCT autor_id FROM public.obras) AND u.is_autor = false;

-- 4. Estado atual das colunas (confirma qual rename será aplicado)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('obras','transacoes')
ORDER BY table_name, ordinal_position;
```

Depois:

- [ ] Backup: `supabase db dump > backup-pre-migration.sql`
- [ ] `supabase db push`
- [ ] Regenerar `schema.sql` (4.2) e tipos (4.3)
- [ ] Smoke test: catálogo carrega, obra abre, acesso gratuito registra, biblioteca lista
- [ ] Commit com migration + snapshot + tipos
