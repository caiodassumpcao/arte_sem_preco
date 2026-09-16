-- ============================================================================
-- Migration 20260916150000 — Perfis públicos de autor
--
-- Hoje "usuarios" só é visível para o próprio dono da linha (RLS), então:
--   - A página de Autores nunca lista ninguém (select().eq('is_autor', true)
--     sempre volta 0 linhas para quem não é o próprio usuário).
--   - Os joins obras/transacoes -> usuarios(nome) voltam null para qualquer
--     visitante, caindo no fallback "Autor Desconhecido".
--
-- Esta migration abre a leitura de autores publicamente, mas SÓ nas colunas
-- seguras (nome, bio, avatar_url, is_autor, created_at) via GRANT por coluna
-- — nunca email nem chave_pix, que continuam só para o próprio dono via a
-- função meu_perfil() (SECURITY DEFINER).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas de perfil público (a UI de Authors.jsx já espera bio/avatar_url)
-- ---------------------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS bio         TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT;

-- ---------------------------------------------------------------------------
-- 2. RLS — autor é visível para todos; o próprio perfil continua visível
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuários podem ver o próprio perfil" ON public.usuarios;
CREATE POLICY "Perfil próprio ou de autor é visível" ON public.usuarios
  FOR SELECT USING (is_autor = true OR auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 3. Column-level privilege — RLS é por linha, não por coluna. Sem isto,
--    qualquer chamada "select=*" na API pública devolveria email/chave_pix
--    de todo autor.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.usuarios FROM anon, authenticated;
GRANT SELECT (id, nome, is_autor, bio, avatar_url, created_at)
  ON public.usuarios TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. meu_perfil() — único caminho para o usuário ler a própria linha
--    completa (email, chave_pix inclusos), contornando o REVOKE acima.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_perfil()
RETURNS public.usuarios
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.usuarios WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.meu_perfil() TO authenticated;
