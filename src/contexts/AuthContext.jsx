import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});
const DEV = import.meta.env.DEV;
const log = (...a) => { if (DEV) console.log('[AuthContext]', ...a); };

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingPerfil, setLoadingPerfil] = useState(false);

  // Carrega o perfil em public.usuarios (fonte do is_autor)
  const carregarPerfil = useCallback(async (userId) => {
    if (!userId) {
      setPerfil(null);
      return null;
    }
    setLoadingPerfil(true);
    try {
      const { data, error } = await supabase.rpc('meu_perfil');

      if (error) {
        console.error('[AuthContext] Erro ao carregar perfil:', error.message);
        setPerfil(null);
        return null;
      }
      setPerfil(data ?? null);
      return data ?? null;
    } finally {
      setLoadingPerfil(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) console.error('[AuthContext] Erro ao buscar sessão inicial:', error.message);
      if (!ativo) return;
      setUser(session?.user ?? null);
      if (session?.user) await carregarPerfil(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log('evento', event);
      setUser(session?.user ?? null);
      if (session?.user) {
        carregarPerfil(session.user.id);
      } else {
        setPerfil(null);
      }
    });

    return () => { ativo = false; subscription.unsubscribe(); };
  }, [carregarPerfil]);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[AuthContext] Falha no login:', error.status, error.message);
      throw error;
    }

    // Rede de segurança: cria o perfil se o trigger não o tiver criado
    if (data.user) {
      try {
        const existente = await carregarPerfil(data.user.id);
        if (!existente) {
          log('perfil ausente, criando pós-login');
          const meta = data.user.user_metadata || {};
          // ignoreDuplicates: nunca sobrescreve uma linha já existente (ex.: is_autor
          // já promovido via tornar_se_autor()) — só preenche o gap se faltar mesmo.
          await supabase.from('usuarios').upsert([{
            id: data.user.id,
            email: data.user.email,
            nome: meta.nome || data.user.email.split('@')[0],
            is_autor: !!meta.is_autor,
          }], { onConflict: 'id', ignoreDuplicates: true });
          await carregarPerfil(data.user.id);
        }
      } catch (syncErr) {
        console.warn('[AuthContext] Aviso ao sincronizar perfil:', syncErr?.message);
      }
    }

    return data;
  };

  const register = async (email, password, nome, isAutor = false) => {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, is_autor: isAutor } },
    });

    if (signUpError) {
      console.error('[AuthContext] Falha no cadastro:', signUpError.message);
      throw signUpError;
    }

    // Com sessão imediata o cliente pode gravar o perfil (RLS ok).
    // Sem sessão, o trigger handle_new_user cuida disso.
    if (data.session && data.user) {
      const { error: insertError } = await supabase
        .from('usuarios')
        .upsert([{ id: data.user.id, email, nome, is_autor: isAutor }], { onConflict: 'id', ignoreDuplicates: true });
      if (insertError) {
        console.warn('[AuthContext] Aviso ao gravar perfil:', insertError.message);
      } else {
        await carregarPerfil(data.user.id);
      }
    }

    return data;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[AuthContext] Erro no logout:', error.message);
      throw error;
    }
    setPerfil(null);
  };

  const value = {
    user,
    perfil,
    isAutor: !!perfil?.is_autor,
    loadingPerfil,
    login,
    register,
    logout,
    recarregarPerfil: () => carregarPerfil(user?.id),
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
