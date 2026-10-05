-- ============================================================================
-- Migration 20261005120000 — Colofão nas obras + links curtos permanentes
--
-- Toda obra em PDF/EPUB passa a sair com uma página final de créditos
-- (colofão) gerada pela Edge Function gerar_arquivo_final, com um link curto
-- de volta para a obra. O arquivo circula fora da plataforma por anos, então:
--
--   * public.links_obra guarda um código curto PERMANENTE por obra
--     (<site>/o/<codigo>). Se a obra for apagada, o link continua resolvendo
--     para as obras do autor em vez de quebrar (obra_id vira NULL).
--   * obras.arquivo_original_url guarda o arquivo exatamente como o autor
--     enviou; obras.arquivo_url passa a ser o arquivo final (com colofão),
--     que é o que o download já usa — nenhuma tela de leitor muda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Arquivo original do autor
-- ----------------------------------------------------------------------------
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS arquivo_original_url text;

COMMENT ON COLUMN public.obras.arquivo_original_url IS
  'Arquivo como o autor enviou. arquivo_url é a versão final distribuída (com colofão em PDF/EPUB).';

-- Obras já publicadas: o arquivo atual é o original (ainda sem colofão).
UPDATE public.obras
   SET arquivo_original_url = arquivo_url
 WHERE arquivo_original_url IS NULL AND arquivo_url IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Links curtos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.links_obra (
  codigo     text PRIMARY KEY CHECK (codigo ~ '^[0-9a-f]{8}$'),
  obra_id    uuid UNIQUE REFERENCES public.obras(id) ON DELETE SET NULL,
  autor_id   uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.links_obra IS
  'Código curto permanente impresso no colofão (<site>/o/<codigo>). Nunca apagar linhas: há arquivos circulando com esses links.';

ALTER TABLE public.links_obra ENABLE ROW LEVEL SECURITY;

-- Leitura pública (a rota /o/:codigo resolve sem login). Escrita só pelo
-- trigger abaixo (SECURITY DEFINER): sem policy de INSERT/UPDATE/DELETE.
CREATE POLICY "Links de obras são públicos" ON public.links_obra
  FOR SELECT USING (true);

REVOKE ALL ON public.links_obra FROM anon, authenticated;
GRANT SELECT ON public.links_obra TO anon, authenticated;
GRANT ALL ON public.links_obra TO service_role;

-- Gera o link da obra. 8 hex = ~4 bilhões de códigos; colisão só repete.
CREATE OR REPLACE FUNCTION public.criar_link_obra(p_obra_id uuid, p_autor_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
BEGIN
  SELECT codigo INTO v_codigo FROM public.links_obra WHERE obra_id = p_obra_id;
  IF v_codigo IS NOT NULL THEN
    RETURN v_codigo;
  END IF;

  LOOP
    v_codigo := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    INSERT INTO public.links_obra (codigo, obra_id, autor_id)
    VALUES (v_codigo, p_obra_id, p_autor_id)
    ON CONFLICT (codigo) DO NOTHING;
    EXIT WHEN FOUND;
  END LOOP;

  RETURN v_codigo;
END $$;

REVOKE EXECUTE ON FUNCTION public.criar_link_obra(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.criar_link_obra_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.criar_link_obra(NEW.id, NEW.autor_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS obras_criar_link ON public.obras;
CREATE TRIGGER obras_criar_link
  AFTER INSERT ON public.obras
  FOR EACH ROW
  EXECUTE FUNCTION public.criar_link_obra_trigger();

-- Backfill: obras já publicadas ganham seu link.
SELECT public.criar_link_obra(id, autor_id) FROM public.obras;
