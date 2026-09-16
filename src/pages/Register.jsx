import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

function Register() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAutor, setIsAutor] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.group('📝 [Register Page] Tentativa de cadastro');
    console.log('Dados:', { email, nome, passwordLength: password.length });
    try {
      const result = await register(email, password, nome, isAutor);
      console.log('✅ [Register Page] Retorno do AuthContext:', {
        userId: result?.user?.id,
        email: result?.user?.email,
        emailConfirmed: !!result?.user?.confirmed_at,
        hasSession: !!result?.session,
      });

      if (result?.user && !result?.user?.confirmed_at && !result?.session) {
        console.log('ℹ️ [Register Page] Usuário criado, mas aguardando confirmação de e-mail. Sem sessão ativa.');
      } else if (result?.user) {
        console.log('🎉 [Register Page] Usuário criado e logado! Redirecionando...');
      } else {
        console.warn('⚠️ [Register Page] Retorno inesperado — sem user object:', result);
      }

      navigate('/');
    } catch (err) {
      console.error('❌ [Register Page] Erro capturado:', {
        message: err.message,
        status: err.status,
        code: err.code,
        fullError: err,
      });
      setError(err.message || 'Falha ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  };

  return (
    <div className="auth-page-wrapper">

      {/* Lado Esquerdo — Identidade Visual */}
      <div className="auth-left">
        <div className="auth-left-content">
          <div className="auth-brand">✦ Arte sem Preço</div>
          <h1 className="auth-slogan">
            Junte-se a quem<br />
            <em>valoriza a arte.</em>
          </h1>
          <p className="auth-tagline">
            Crie sua conta gratuitamente e comece a descobrir obras incríveis
            de autores independentes. Sem barreiras, sem preço obrigatório.
          </p>
        </div>
      </div>

      {/* Lado Direito — Formulário */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Criar uma conta</h2>
            <p>Leva menos de um minuto.</p>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Nome completo</label>
              <div className="input-with-icon">
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
                <User size={16} className="input-icon" />
              </div>
            </div>

            <div className="form-group">
              <label>E-mail</label>
              <div className="input-with-icon">
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Mail size={16} className="input-icon" />
              </div>
            </div>

            <div className="form-group">
              <label>Senha</label>
              <div className="input-with-icon">
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength="6"
                />
                <Lock size={16} className="input-icon" />
              </div>
            </div>

            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={isAutor}
                onChange={(e) => setIsAutor(e.target.checked)}
              />
              <span>Sou autor(a) e quero publicar minhas obras</span>
            </label>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Criando conta...</>
                : <><UserPlus size={16} /> Criar conta grátis</>
              }
            </button>
          </form>

          <div className="auth-redirect">
            Já tem uma conta? <Link to="/login">Fazer login</Link>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Register;
