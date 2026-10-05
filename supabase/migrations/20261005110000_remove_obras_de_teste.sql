-- ============================================================================
-- Migration 20261005110000 — Remove as duas obras de teste
--
-- Limpeza de dados pedida antes do lançamento do colofão: "teste 4" e "teste"
-- foram as primeiras obras criadas, por contas de teste. Saem junto todas as
-- transações delas — inclusive um Pix real de R$ 1,00 (teste do pagamento em
-- 22/09), decisão explícita do responsável; o registro segue no painel do
-- Mercado Pago.
--
-- Filtra por id E título: num banco onde esses ids não existam (ou tenham
-- outro conteúdo) a migration não apaga nada.
-- ============================================================================

WITH alvo AS (
  SELECT id FROM public.obras
   WHERE (id, titulo) IN (
     ('71adc781-49be-4f57-b054-45ce189f178b'::uuid, 'teste 4'),
     ('bff0158f-757e-4c16-b08f-e0fbe08881be'::uuid, 'teste')
   )
)
DELETE FROM public.transacoes WHERE obra_id IN (SELECT id FROM alvo);

-- obra_categorias sai em cascata com a obra.
DELETE FROM public.obras
 WHERE (id, titulo) IN (
   ('71adc781-49be-4f57-b054-45ce189f178b'::uuid, 'teste 4'),
   ('bff0158f-757e-4c16-b08f-e0fbe08881be'::uuid, 'teste')
 );
