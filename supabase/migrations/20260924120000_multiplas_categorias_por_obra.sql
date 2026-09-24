-- ============================================================================
-- Migration 20260924120000 — Múltiplas categorias por obra (até 3)
--
-- As categorias atuais misturam gênero ("Fantasia"), forma ("Poesia",
-- "Contos & Crônicas", "Quadrinhos & HQ") e público ("Infantil & Juvenil").
-- Uma HQ de fantasia para crianças pertence legitimamente às três, e com uma
-- única categoria ela some dos outros dois filtros do catálogo.
--
-- Modelo:
--   * public.obra_categorias guarda TODAS as categorias da obra, com `ordem`
--     0..2 (0 = principal). CHECK + UNIQUE(obra_id, ordem) limitam a 3 no
--     próprio banco, sem trigger de contagem.
--   * obras.categoria_id continua existindo como a categoria PRINCIPAL. Isso
--     mantém o front já publicado funcionando durante o deploy e dá uma
--     categoria única para exibir no card.
--   * Um trigger em obras mantém a linha ordem = 0 em sincronia com
--     obras.categoria_id (cobre quem ainda grava só categoria_id, como o
--     front antigo), e a RPC definir_categorias_obra() grava o conjunto
--     inteiro de forma atômica.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.obra_categorias (
  obra_id      uuid     NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  categoria_id uuid     NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  ordem        smallint NOT NULL CHECK (ordem BETWEEN 0 AND 2),
  -- PK surrogate (e não (obra_id, categoria_id)) de propósito: o PostgREST só
  -- trata como junção M2M uma tabela cujas FKs fazem parte da PK. Se fosse,
  -- `obras?select=categorias(nome)` passaria a ter dois caminhos possíveis
  -- (FK direta + junção) e quebraria com PGRST201 em todas as telas.
  id           uuid     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  CONSTRAINT obra_categorias_obra_categoria_key UNIQUE (obra_id, categoria_id),
  CONSTRAINT obra_categorias_obra_ordem_key UNIQUE (obra_id, ordem)
);

CREATE INDEX IF NOT EXISTS obra_categorias_categoria_idx ON public.obra_categorias (categoria_id);

COMMENT ON TABLE public.obra_categorias IS
  'Categorias de cada obra (até 3). ordem = 0 é a principal e espelha obras.categoria_id.';

-- Backfill: a categoria atual de cada obra vira a principal.
INSERT INTO public.obra_categorias (obra_id, categoria_id, ordem)
SELECT id, categoria_id, 0 FROM public.obras WHERE categoria_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- RLS: leitura pública (como obras e categorias); escrita só pelo autor.
-- ----------------------------------------------------------------------------
ALTER TABLE public.obra_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorias de obras são públicas" ON public.obra_categorias
  FOR SELECT USING (true);

CREATE POLICY "Autor gerencia categorias das suas obras" ON public.obra_categorias
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_id AND o.autor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_id AND o.autor_id = auth.uid()));

GRANT SELECT ON public.obra_categorias TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obra_categorias TO authenticated;
GRANT ALL ON public.obra_categorias TO service_role;

-- ----------------------------------------------------------------------------
-- Sincronia obras.categoria_id -> linha principal (ordem = 0).
-- Roda como o próprio usuário, então passa pela policy acima.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sincronizar_categoria_principal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.obra_categorias
   WHERE obra_id = NEW.id
     AND (ordem = 0 OR categoria_id = NEW.categoria_id);

  IF NEW.categoria_id IS NOT NULL THEN
    INSERT INTO public.obra_categorias (obra_id, categoria_id, ordem)
    VALUES (NEW.id, NEW.categoria_id, 0);
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS obras_sincronizar_categoria_principal ON public.obras;
CREATE TRIGGER obras_sincronizar_categoria_principal
  AFTER INSERT OR UPDATE OF categoria_id ON public.obras
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_categoria_principal();

-- ----------------------------------------------------------------------------
-- RPC: define o conjunto completo de categorias (a 1ª é a principal).
-- SECURITY INVOKER: a RLS de obras/obra_categorias garante que só o autor
-- consegue alterar; o UPDATE sem linha afetada vira erro explícito.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_categorias_obra(p_obra_id uuid, p_categoria_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total integer := coalesce(cardinality(p_categoria_ids), 0);
BEGIN
  IF v_total < 1 OR v_total > 3 THEN
    RAISE EXCEPTION 'Selecione de 1 a 3 categorias (recebido: %).', v_total
      USING ERRCODE = '22023';
  END IF;

  IF array_position(p_categoria_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT c) FROM unnest(p_categoria_ids) c) <> v_total THEN
    RAISE EXCEPTION 'Categorias repetidas ou vazias.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.obras SET categoria_id = p_categoria_ids[1] WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.obra_categorias WHERE obra_id = p_obra_id;

  INSERT INTO public.obra_categorias (obra_id, categoria_id, ordem)
  SELECT p_obra_id, c, (n - 1)::smallint
    FROM unnest(p_categoria_ids) WITH ORDINALITY AS t(c, n);
END $$;

COMMENT ON FUNCTION public.definir_categorias_obra(uuid, uuid[]) IS
  'Substitui as categorias da obra (1 a 3; a primeira vira a principal em obras.categoria_id).';

REVOKE EXECUTE ON FUNCTION public.definir_categorias_obra(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_categorias_obra(uuid, uuid[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- Recomendações: a afinidade de categoria passa a considerar todas as
-- categorias da obra (2 pontos por categoria em comum), não só a principal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_recomendacoes(p_limit integer DEFAULT 6)
RETURNS TABLE(obra_id uuid, score numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cats AS (
    SELECT oc.obra_id, array_agg(oc.categoria_id) AS ids
      FROM public.obra_categorias oc
     GROUP BY oc.obra_id
  ),
  interacoes AS (
    SELECT
      o.id AS obra_id,
      o.autor_id,
      coalesce(c.ids, '{}') AS categoria_ids,
      o.causa_id,
      o.tags,
      -- Uma obra apoiada (contribuição paga) pesa 3x mais que uma apenas
      -- salva/baixada de graça como sinal de preferência do leitor.
      CASE WHEN t.valor_pago > 0 THEN 3 ELSE 1 END AS peso
    FROM public.transacoes t
    JOIN public.obras o ON o.id = t.obra_id
    LEFT JOIN cats c ON c.obra_id = o.id
    WHERE t.usuario_id = auth.uid() AND t.status = 'concluido'
  )
  SELECT
    o.id AS obra_id,
    COALESCE(SUM(
      i.peso * (
        (CASE WHEN i.autor_id = o.autor_id THEN 3 ELSE 0 END) +
        (CASE WHEN i.causa_id IS NOT NULL AND i.causa_id = o.causa_id THEN 2 ELSE 0 END) +
        2 * cardinality(ARRAY(
          SELECT unnest(i.categoria_ids) INTERSECT SELECT unnest(coalesce(c.ids, '{}'))
        )) +
        cardinality(ARRAY(
          SELECT unnest(COALESCE(i.tags, '{}')) INTERSECT SELECT unnest(COALESCE(o.tags, '{}'))
        ))
      )
    ), 0)::numeric AS score
  FROM public.obras o
  LEFT JOIN cats c ON c.obra_id = o.id
  LEFT JOIN interacoes i ON true
  WHERE o.id NOT IN (SELECT obra_id FROM interacoes)
  GROUP BY o.id
  ORDER BY score DESC, o.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.obter_recomendacoes(integer) TO anon, authenticated;
