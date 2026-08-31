import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, LogIn, UserPlus, Loader2, BookOpen, Feather, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

function Login() {
  const [tab, setTab] = useState('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [nome, setNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [isAutor, setIsAutor] = useState(false); // false = leitor, true = artista

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log('📌 [Login Page] Processando submissão de login:', loginEmail);
    try {
      const data = await login(loginEmail, loginPassword);
      console.log('📌 [Login Page] Login realizado com sucesso! Redirecionando para a Home...', data);
      navigate('/');
    } catch (err) {
      console.error('📌 [Login Page] Erro capturado no handleLogin:', err);
      let msg = err.message || 'E-mail ou senha incorretos. Tente novamente.';
      if (err.message?.includes('Email not confirmed')) {
        msg = '⚠️ Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou desative "Confirm email" no Supabase Dashboard.';
      } else if (err.message?.includes('Invalid login credentials')) {
        msg = '❌ E-mail ou senha incorretos. Verifique suas credenciais.';
      }
      console.error('[Login Page] ❌ Erro ao tentar logar:', err);
      setError(err.message || 'E-mail ou senha incorretos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    console.log('[Register Page] Submetendo formulário de cadastro...', { regEmail, nome, isAutor });
    try {
      const result = await register(regEmail, regPassword, nome, isAutor);
      console.log('[Register Page] Retorno do cadastro:', result);
      
      // Se o Supabase exige confirmação de e-mail, user.confirmed_at é null e result.session é null
      if (result.user && !result.user.confirmed_at && !result.session) {
        console.warn('[Register Page] ✉️ Confirmação de e-mail é exigida pelo Supabase. Link enviado para:', regEmail);
        setSuccessMsg(`Quase lá! Enviamos um link de confirmação para ${regEmail}. Verifique sua caixa de entrada (e o spam).`);
      } else {
        console.log('[Register Page] Cadastro e login imediato concluídos. Redirecionando para a home (/).');
        navigate('/');
      }
    } catch (err) {
      console.error('[Register Page] ❌ Erro ao tentar cadastrar:', err);
      let msg = err.message || 'Não foi possível criar sua conta. Tente novamente.';
      if (err.message?.includes('rate limit')) {
        msg = '🛑 Limite de envio de e-mails atingido (Supabase Rate Limit). Para dev/testes, desative "Confirm Email" no painel do Supabase (Auth -> Settings).';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };


  const switchTab = (t) => { setTab(t); setError(''); };

  const sloganLeft = tab === 'login'
    ? { title: <>A arte tem valor.<br /><em>O preço, você decide.</em></>, sub: 'Uma biblioteca digital aberta. Acesse qualquer obra com o valor que puder — R$ 0 ou mais.' }
    : isAutor
      ? { title: <>Publique sua obra.<br /><em>Alcance mais leitores.</em></>, sub: 'Cadastre-se como artista e leve sua criação para uma comunidade que valoriza e apoia a cultura independente.' }
      : { title: <>Leia, descubra,<br /><em>apoie a arte.</em></>, sub: 'Crie sua conta como leitor apoiador e tenha acesso livre a obras incríveis de artistas independentes.' };

  return (
    <div className="auth-page-wrapper">

      {/* Lado Esquerdo — Identidade Visual */}
      <div className="auth-left">
        <div className="auth-left-content">
          <div className="auth-brand">✦ Arte sem Preço</div>
          <h1 className="auth-slogan">{sloganLeft.title}</h1>
          <p className="auth-tagline">{sloganLeft.sub}</p>
        </div>
      </div>

      {/* Lado Direito — Formulário */}
      <div className="auth-right">
        <div className="auth-card">

          {/* Abas */}
          <div className="auth-tabs">
            <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')} type="button">
              <LogIn size={15} /> Entrar
            </button>
            <button className={`auth-tab ${tab === 'cadastro' ? 'active' : ''}`} onClick={() => switchTab('cadastro')} type="button">
              <UserPlus size={15} /> Criar conta
            </button>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {successMsg && (
            <div className="auth-success">
              <CheckCircle size={16} /> {successMsg}
            </div>
          )}

          {/* ─── FORMULÁRIO DE LOGIN ─── */}
          {tab === 'login' && (
            <>
              <div className="auth-header">
                <h2>Bem-vindo de volta</h2>
                <p>Acesse sua conta para continuar.</p>
              </div>
              <form onSubmit={handleLogin} className="auth-form">
                <div className="form-group">
                  <label>E-mail</label>
                  <div className="input-with-icon">
                    <input type="email" placeholder="seu@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                    <Mail size={16} className="input-icon" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Senha</label>
                  <div className="input-with-icon">
                    <input type="password" placeholder="Sua senha" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                    <Lock size={16} className="input-icon" />
                  </div>
                </div>
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : <><LogIn size={16} /> Entrar</>}
                </button>
              </form>
              <div className="auth-redirect">
                Ainda não tem conta?{' '}
                <button type="button" className="auth-link-btn" onClick={() => switchTab('cadastro')}>Criar conta grátis</button>
              </div>
            </>
          )}

          {/* ─── FORMULÁRIO DE CADASTRO ─── */}
          {tab === 'cadastro' && (
            <>
              {/* Seletor de Perfil */}
              <div className="profile-selector">
                <button
                  type="button"
                  className={`profile-option ${!isAutor ? 'active' : ''}`}
                  onClick={() => setIsAutor(false)}
                >
                  <BookOpen size={22} />
                  <strong>Leitor Apoiador</strong>
                  <span>Acesse e apoie obras</span>
                </button>
                <button
                  type="button"
                  className={`profile-option ${isAutor ? 'active' : ''}`}
                  onClick={() => setIsAutor(true)}
                >
                  <Feather size={22} />
                  <strong>Artista / Autor</strong>
                  <span>Publique suas obras</span>
                </button>
              </div>

              <div className="auth-header" style={{ marginBottom: '1.25rem' }}>
                <h2>{isAutor ? 'Sou artista / autor' : 'Sou leitor apoiador'}</h2>
                <p>{isAutor ? 'Crie sua conta e publique obras na plataforma.' : 'Leia e apoie artistas com o valor que quiser.'}</p>
              </div>

              <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                  <label>Nome completo</label>
                  <div className="input-with-icon">
                    <input type="text" placeholder="Seu nome" value={nome} onChange={e => setNome(e.target.value)} required />
                    <User size={16} className="input-icon" />
                  </div>
                </div>
                <div className="form-group">
                  <label>E-mail</label>
                  <div className="input-with-icon">
                    <input type="email" placeholder="seu@email.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
                    <Mail size={16} className="input-icon" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Senha</label>
                  <div className="input-with-icon">
                    <input type="password" placeholder="Mínimo 6 caracteres" value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength="6" />
                    <Lock size={16} className="input-icon" />
                  </div>
                </div>
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Criando...</>
                    : isAutor
                      ? <><Feather size={16} /> Criar conta de artista</>
                      : <><BookOpen size={16} /> Criar conta de leitor</>
                  }
                </button>
                <p className="auth-terms">
                  Ao criar sua conta, você concorda com o princípio do acesso aberto à cultura desta plataforma.
                </p>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default Login;
