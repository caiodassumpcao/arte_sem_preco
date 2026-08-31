import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] Inicializando checagem de sessão...');

    // Busca a sessão atual
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[AuthContext] Erro ao buscar sessão inicial:', error);
      } else {
        console.log('[AuthContext] Sessão inicial obtida:', session ? session.user : 'Nenhum usuário logado');
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuta mudanças de autenticação (login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AuthContext] Evento Auth [${event}]:`, session ? session.user : 'Sem sessão ativa');
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    console.log('[AuthContext] Tentando login (signInWithPassword) para:', email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      console.error('[AuthContext] ❌ Erro no login:', error.status, error.message, error);
      throw error;
    }

    console.log('[AuthContext] ✅ Login efetuado com sucesso! Usuário:', data.user);

    // Garantia: se o perfil em public.usuarios ainda não existir, cria agora que temos sessão autenticada (RLS ok)
    if (data.user) {
      try {
        const { data: perfil } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!perfil) {
          console.log('[AuthContext] Perfil em public.usuarios não encontrado. Criando perfil pós-login...');
          const meta = data.user.user_metadata || {};
          await supabase.from('usuarios').upsert([
            {
              id: data.user.id,
              email: data.user.email,
              nome: meta.nome || data.user.email.split('@')[0],
              is_autor: !!meta.is_autor
            }
          ]);
        }
      } catch (syncErr) {
        console.warn('[AuthContext] Aviso ao verificar/sincronizar perfil no login:', syncErr);
      }
    }

    return data;
  };

  const register = async (email, password, nome, isAutor = false) => {
    console.log('[AuthContext] Tentando cadastrar novo usuário (signUp):', { email, nome, isAutor });

    // 1. Cria o usuário no Supabase Auth
    const { data, error: signUpError } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: { nome, is_autor: isAutor }
      }
    });

    if (signUpError) {
      console.error('❌ [AuthContext] Erro ao cadastrar no Supabase Auth (signUp):', signUpError);
      throw signUpError;
    }

    console.log('✅ [AuthContext] Supabase Auth respondeu com sucesso:', {
      userId: data.user?.id,
      emailConfirmed: data.user?.confirmed_at ? true : false,
      hasSession: !!data.session
    });

    // 2. Tabela pública 'usuarios':
    // Se o Supabase gerou uma sessão imediata (Confirm Email desativado), o cliente tem token auth.uid() e pode fazer upsert.
    // Se NÃO gerou sessão (Confirm Email ativado), o cliente anônimo é bloqueado por RLS.
    // Nesse caso, o Trigger no Postgres (supabase/trigger_new_user.sql) é responsável por criar o perfil automaticamente.
    if (data.session && data.user) {
      console.log('💾 [AuthContext] Sessão ativa. Salvando perfil na tabela public.usuarios via client-side...');
      const { data: dbData, error: insertError } = await supabase
        .from('usuarios')
        .upsert(
          [{ id: data.user.id, email, nome, is_autor: isAutor }],
          { onConflict: 'id' }
        )
        .select();
      
      if (insertError) {
        console.warn('⚠️ [AuthContext] Erro ao inserir na tabela public.usuarios:', insertError.message);
      } else {
        console.log('🎉 [AuthContext] Perfil salvo em public.usuarios com sucesso:', dbData);
      }
    } else if (data.user) {
      console.log('ℹ️ [AuthContext] Usuário criado no Auth sem sessão imediata (confirmação de email pendente).');
      console.log('ℹ️ [AuthContext] O perfil em public.usuarios será criado automaticamente pelo Trigger do Banco (trigger_new_user.sql).');
    }

    
    return data;
  };

  const logout = async () => {
    console.log('🚪 [AuthContext] Realizando logout...');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('❌ [AuthContext] Erro no logout:', error);
      throw error;
    }
    console.log('✅ [AuthContext] Logout concluído.');
  };

  const value = {
    user,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

