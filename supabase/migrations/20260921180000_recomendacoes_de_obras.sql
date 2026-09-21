-- ============================================================================
-- Migration 20260921160000 — Recomendações de obras
--
-- Recomendação content-based, sem tabela nova: usa o próprio histórico de
-- transacoes do leitor (acesso gratuito = "curtiu/baixou", valor_pago > 0 =
-- "apoiou") para pontuar as demais obras por autor, causa, categoria e tags
-- em comum. Sem histórico (leitor novo ou deslogado), cai para as obras mais
-- recentes — o mesmo critério que a Home já usa em "Em Destaque".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.obter_recomendacoes(p_limit integer DEFAULT 6)
RETURNS TABLE(obra_id uuid, score numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH interacoes AS (
    SELECT
      o.id AS obra_id,
      o.autor_id,
      o.categoria_id,
      o.causa_id,
      o.tags,
      -- Uma obra apoiada (contribuição paga) pesa 3x mais que uma apenas
      -- salva/baixada de graça como sinal de preferência do leitor.
      CASE WHEN t.valor_pago > 0 THEN 3 ELSE 1 END AS peso
    FROM public.transacoes t
    JOIN public.obras o ON o.id = t.obra_id
    WHERE t.usuario_id = auth.uid() AND t.status = 'concluido'
  )
  SELECT
    o.id AS obra_id,
    COALESCE(SUM(
      i.peso * (
        (CASE WHEN i.autor_id = o.autor_id THEN 3 ELSE 0 END) +
        (CASE WHEN i.causa_id IS NOT NULL AND i.causa_id = o.causa_id THEN 2 ELSE 0 END) +
        (CASE WHEN i.categoria_id IS NOT NULL AND i.categoria_id = o.categoria_id THEN 2 ELSE 0 END) +
        cardinality(ARRAY(
          SELECT unnest(COALESCE(i.tags, '{}')) INTERSECT SELECT unnest(COALESCE(o.tags, '{}'))
        ))
      )
    ), 0)::numeric AS score
  FROM public.obras o
  LEFT JOIN interacoes i ON true
  WHERE o.id NOT IN (SELECT obra_id FROM interacoes)
  GROUP BY o.id
  ORDER BY score DESC, o.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

COMMENT ON FUNCTION public.obter_recomendacoes(integer) IS
  'Recomenda obras com base no histórico de transacoes do leitor logado (auth.uid()). Sem histórico, retorna as obras mais recentes.';

-- Leitura pública: leitores deslogados também recebem a lista (cai no
-- fallback de "mais recentes" porque auth.uid() é NULL para eles).
GRANT EXECUTE ON FUNCTION public.obter_recomendacoes(integer) TO anon, authenticated;
