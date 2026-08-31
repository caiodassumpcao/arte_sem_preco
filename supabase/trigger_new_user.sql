-- ============================================================
-- TRIGGER: Cria perfil em public.usuarios automaticamente
-- quando um usuário é criado no Supabase Auth.
-- Execute este SQL no Supabase → SQL Editor
-- ============================================================

-- 1. Função que será chamada pelo trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome, is_autor)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'is_autor')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2. Trigger que dispara a função ao criar novo usuário no Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
