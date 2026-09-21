-- ============================================================================
-- Migration 20260921170000 — Policy de INSERT ausente em usuarios
--
-- A tabela public.usuarios nunca teve uma RLS policy de INSERT. Isso não
-- afeta o cadastro normal (a trigger handle_new_user roda SECURITY DEFINER e
-- ignora RLS), mas o "upsert de segurança" do client em AuthContext.register()
-- e AuthContext.login() (que só age quando a trigger falhou em criar o
-- perfil) sempre falhava silenciosamente com 42501/403, pois esse insert
-- roda como o próprio usuário autenticado.
-- ============================================================================

CREATE POLICY "Usuários inserem o próprio perfil" ON public.usuarios
  FOR INSERT WITH CHECK (auth.uid() = id);
