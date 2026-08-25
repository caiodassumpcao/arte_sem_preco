import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Busca a sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuta mudanças de autenticação (login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const register = async (email, password, nome) => {
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: { nome } // Salva o nome nos metadados do usuário
      }
    });
    if (error) throw error;
    
    // Opcional: Aqui poderíamos inserir na tabela public.usuarios, mas 
    // a melhor prática no Supabase é usar uma Trigger no banco para 
    // inserir automaticamente quando o usuário é criado no auth.
    // Como simplificação do MVP, faremos o insert manualmente por enquanto se o usuário foi criado.
    if (data.user) {
      await supabase.from('usuarios').insert([
        { id: data.user.id, email: email, nome: nome }
      ]);
    }
    
    return data;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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
