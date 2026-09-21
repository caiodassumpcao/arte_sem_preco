-- ============================================================================
-- Migration 20260921160000 — Leitor pode se tornar autor
--
-- Contexto: não existia nenhum caminho para promover um leitor a autor depois
-- do cadastro (is_autor só era setado no signup). Além disso, a policy de
-- UPDATE em usuarios ("auth.uid() = id") não tem WITH CHECK, então qualquer
-- update direto do client na própria linha já passava por is_autor sem
-- validação alguma — o mesmo tipo de falha que a migration 120000 corrigiu
-- para "obras", mas nunca foi replicada aqui.
--
-- Esta migration:
--   1. Restringe a coluna is_autor a updates via função dedicada (client não
--      pode mais fazer update(is_autor) direto na tabela).
--   2. Cria tornar_se_autor(), SECURITY DEFINER, único caminho para o próprio
--      usuário virar autor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coluna is_autor deixa de ser editável via UPDATE direto do client
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.usuarios FROM anon, authenticated;

GRANT UPDATE (nome, bio, avatar_url, chave_pix)
  ON public.usuarios TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC: tornar_se_autor() — o próprio usuário autenticado vira autor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tornar_se_autor()
RETURNS public.usuarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  perfil_atualizado public.usuarios;
BEGIN
  UPDATE public.usuarios
  SET is_autor = true
  WHERE id = auth.uid()
  RETURNING * INTO perfil_atualizado;

  IF perfil_atualizado.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum perfil encontrado para o usuário autenticado.';
  END IF;

  RETURN perfil_atualizado;
END;
$$;

REVOKE ALL ON FUNCTION public.tornar_se_autor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tornar_se_autor() TO authenticated;
