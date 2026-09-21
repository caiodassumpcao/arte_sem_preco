import { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Feather, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Profile.css';

export default function Profile() {
  const { user, perfil, isAutor, recarregarPerfil } = useAuth();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const displayName = perfil?.nome || user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Usuário';

  const handleTornarSeAutor = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const { error } = await supabase.rpc('tornar_se_autor');
      if (error) throw error;

      await recarregarPerfil();
      setFeedback({ type: 'success', text: 'Pronto! Sua conta agora é de autor(a).' });
    } catch (err) {
      console.error('[Profile] Erro ao tornar-se autor:', err);
      setFeedback({ type: 'error', text: err.message || 'Não foi possível concluir a alteração. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page container py-8">
      <div className="profile-hero mb-8">
        <div className="profile-avatar-circle">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-serif text-2xl font-bold">{displayName}</h1>
          <p className="text-muted text-sm mt-1">{user?.email}</p>
          <span className={`badge ${isAutor ? 'badge-accent' : 'badge-outline'} mt-2`}>
            {isAutor ? 'Autor(a)' : 'Leitor(a)'}
          </span>
        </div>
      </div>

      <div className="card p-6 bg-surface border">
        {isAutor ? (
          <div className="profile-status-block">
            <CheckCircle2 size={32} className="text-accent" />
            <div>
              <h2 className="text-lg font-bold mb-1">Você já é autor(a)</h2>
              <p className="text-muted text-sm mb-4">
                Publique e gerencie suas obras a qualquer momento pelo Painel do Autor.
              </p>
              <Link to="/painel" className="btn btn-primary flex items-center gap-2 w-fit">
                <Feather size={16} /> Ir para o Painel do Autor
              </Link>
            </div>
          </div>
        ) : (
          <div className="profile-status-block">
            <Sparkles size={32} className="text-primary" />
            <div>
              <h2 className="text-lg font-bold mb-1">Quer publicar suas próprias obras?</h2>
              <p className="text-muted text-sm mb-4">
                Torne sua conta de leitor(a) em uma conta de autor(a) para publicar obras
                e receber o apoio de outros leitores. Você não perde o acesso à sua biblioteca.
              </p>

              {feedback && (
                <div className={`profile-feedback ${feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}`}>
                  {feedback.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                  {feedback.text}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary flex items-center gap-2 w-fit"
                onClick={handleTornarSeAutor}
                disabled={loading}
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Atualizando...</>
                  : <><User size={16} /> Tornar-me autor(a)</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
