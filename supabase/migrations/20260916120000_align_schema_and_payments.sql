-- ============================================================================
-- Migration 20260916120000 — Alinhamento de schema + suporte a pagamento real
--
-- IDEMPOTENTE e DEFENSIVA: pode rodar em um banco que já sofreu alterações
-- manuais pelo painel do Supabase. Cada bloco verifica o estado antes de agir.
--
-- Padrão adotado (o que o frontend já usa em produção):
--   obras.descricao   obras.preco   obras.capa_url   obras.arquivo_url
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. OBRAS — normalizar nomes de colunas
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='sinopse')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='descricao') THEN
    ALTER TABLE public.obras RENAME COLUMN sinopse TO descricao;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='preco_sugerido')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='preco') THEN
    ALTER TABLE public.obras RENAME COLUMN preco_sugerido TO preco;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='url_capa')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='capa_url') THEN
    ALTER TABLE public.obras RENAME COLUMN url_capa TO capa_url;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='url_arquivo')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='obras' AND column_name='arquivo_url') THEN
    ALTER TABLE public.obras RENAME COLUMN url_arquivo TO arquivo_url;
  END IF;
END $$;

-- Garante que as colunas existam mesmo em bancos que nunca tiveram as antigas
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS descricao    TEXT,
  ADD COLUMN IF NOT EXISTS preco        NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS capa_url     TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_url  TEXT,
  ADD COLUMN IF NOT EXISTS tags         TEXT[],
  ADD COLUMN IF NOT EXISTS causa_id     UUID;

-- ---------------------------------------------------------------------------
-- 2. TRANSACOES — colunas exigidas pelo fluxo de pagamento real
-- ---------------------------------------------------------------------------
ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS request_id       UUID,
  ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS valor_autor      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_plataforma NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS status_repasse   TEXT DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS gateway          TEXT DEFAULT 'mercadopago',
  ADD COLUMN IF NOT EXISTS gateway_payload  JSONB,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

-- Domínio de status controlado
ALTER TABLE public.transacoes DROP CONSTRAINT IF EXISTS transacoes_status_chk;
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_status_chk
  CHECK (status IN ('pendente','concluido','falhou','estornado','contestado'));

-- Idempotência do webhook: um pagamento do gateway = uma transação
CREATE UNIQUE INDEX IF NOT EXISTS transacoes_gateway_id_uniq
  ON public.transacoes (gateway_id) WHERE gateway_id IS NOT NULL;

-- Idempotência da preferência: uma tentativa de checkout = uma transação
CREATE UNIQUE INDEX IF NOT EXISTS transacoes_request_id_uniq
  ON public.transacoes (request_id) WHERE request_id IS NOT NULL;

-- Uma obra "acessada gratuitamente" só uma vez por usuário (evita o erro de
-- maybeSingle() com múltiplas linhas em BookCard/BookDetails)
--
-- Antes do índice: remove duplicatas existentes (mesmo usuario_id + obra_id,
-- acesso gratuito), mantendo a linha mais antiga. Sem isso o CREATE UNIQUE
-- INDEX falha em bancos que já registraram o mesmo acesso gratuito 2x.
WITH duplicatas AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY usuario_id, obra_id
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.transacoes
  WHERE gateway_id IS NULL AND request_id IS NULL
)
DELETE FROM public.transacoes
WHERE id IN (SELECT id FROM duplicatas WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS transacoes_acesso_gratuito_uniq
  ON public.transacoes (usuario_id, obra_id)
  WHERE gateway_id IS NULL AND request_id IS NULL;

CREATE INDEX IF NOT EXISTS transacoes_usuario_idx ON public.transacoes (usuario_id);
CREATE INDEX IF NOT EXISTS transacoes_obra_idx    ON public.transacoes (obra_id);
CREATE INDEX IF NOT EXISTS obras_autor_idx        ON public.obras (autor_id);

-- ---------------------------------------------------------------------------
-- 3. RLS de TRANSACOES — o cliente só registra acesso gratuito
-- ---------------------------------------------------------------------------
-- Antes: o cliente podia inserir qualquer valor_pago. Agora contribuições pagas
-- só entram pelo webhook (service role).
DROP POLICY IF EXISTS "Usuários podem salvar obras" ON public.transacoes;
CREATE POLICY "Usuários registram acesso gratuito" ON public.transacoes
  FOR INSERT WITH CHECK (
    auth.uid() = usuario_id
    AND valor_pago = 0
    AND gateway_id IS NULL
  );

-- Leitura da própria transação por request_id na tela de sucesso
DROP POLICY IF EXISTS "Usuários veem suas transações" ON public.transacoes;
CREATE POLICY "Usuários veem suas transações" ON public.transacoes
  FOR SELECT USING (auth.uid() = usuario_id);

-- ---------------------------------------------------------------------------
-- 4. RLS de OBRAS — separar leitura pública de escrita do autor
-- ---------------------------------------------------------------------------
-- Antes: FOR ALL USING (auth.uid() = autor_id) sem WITH CHECK, permitindo
-- insert com autor_id de terceiro.
DROP POLICY IF EXISTS "Autores podem gerenciar suas obras" ON public.obras;

CREATE POLICY "Autores inserem suas obras" ON public.obras
  FOR INSERT WITH CHECK (
    auth.uid() = autor_id
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_autor = true)
  );

CREATE POLICY "Autores editam suas obras" ON public.obras
  FOR UPDATE USING (auth.uid() = autor_id) WITH CHECK (auth.uid() = autor_id);

CREATE POLICY "Autores removem suas obras" ON public.obras
  FOR DELETE USING (auth.uid() = autor_id);

-- ---------------------------------------------------------------------------
-- 5. AUDITORIA DE WEBHOOK
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway       TEXT NOT NULL DEFAULT 'mercadopago',
  evento_tipo   TEXT,
  payment_id    TEXT,
  assinatura_ok BOOLEAN,
  payload       JSONB,
  processado    BOOLEAN DEFAULT false,
  erro          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhook_eventos ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: acessível apenas via service_role (Edge Function).

CREATE INDEX IF NOT EXISTS webhook_eventos_pendentes_idx
  ON public.webhook_eventos (created_at) WHERE processado = false;

-- ---------------------------------------------------------------------------
-- 6. TRIGGER de updated_at em transacoes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS transacoes_set_updated_at ON public.transacoes;
CREATE TRIGGER transacoes_set_updated_at
  BEFORE UPDATE ON public.transacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. STORAGE — restringir upload a autores, em pastas próprias
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Autores podem fazer upload" ON storage.objects;
CREATE POLICY "Autores podem fazer upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'obras'
    AND auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_autor = true)
  );
