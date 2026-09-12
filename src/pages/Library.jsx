import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Book, CheckCircle2, Loader2, Download, Heart, Compass, Sparkles, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Library.css';

export default function Library() {
  const { user: authUser } = useAuth();
  const [savedBooks, setSavedBooks] = useState([]);
  const [paidBooks, setPaidBooks] = useState([]);
  const [activeTab, setActiveTab] = useState('todas'); // 'todas', 'salvas', 'apoiadas'
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const userName = authUser?.user_metadata?.nome || authUser?.email?.split('@')[0] || 'Leitor';

  useEffect(() => {
    async function fetchLibrary() {
      try {
        setLoadError(null);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('transacoes')
          .select(`
            valor_pago,
            created_at,
            obras (
              id,
              titulo,
              capa_url,
              arquivo_url,
              descricao,
              preco,
              usuarios(nome),
              categorias(nome)
            )
          `)
          .eq('usuario_id', session.user.id)
          .eq('status', 'concluido')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[Library] Erro na query do Supabase:', error);
          throw error;
        }

        const saved = [];
        const paid = [];

        (data || []).forEach(t => {
          if (!t.obras) return;
          const b = {
            id: t.obras.id,
            title: t.obras.titulo,
            author: t.obras.usuarios?.nome || 'Autor',
            category: t.obras.categorias?.nome || 'Literatura',
            coverUrl: t.obras.capa_url || '/src/assets/placeholder.png',
            downloadUrl: t.obras.arquivo_url,
            synopsis: t.obras.descricao,
            suggestedPrice: Number(t.obras.preco || 0),
            paidValue: Number(t.valor_pago || 0),
            addedAt: t.created_at
          };

          if (Number(t.valor_pago) > 0) {
            paid.push(b);
          } else {
            saved.push(b);
          }
        });

        // Filtra duplicatas dentro das próprias listas (por segurança)
        const uniquePaid = [...new Map(paid.map(item => [String(item.id), item])).values()];
        const uniqueSaved = [...new Map(saved.map(item => [String(item.id), item])).values()];

        setPaidBooks(uniquePaid);
        setSavedBooks(uniqueSaved);
      } catch (err) {
        console.error('Erro ao buscar biblioteca:', err);
        setLoadError(err.message || 'Erro ao carregar sua biblioteca.');
        setSavedBooks([]);
        setPaidBooks([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLibrary();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-screen">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="container py-20 text-center min-h-screen flex flex-col items-center justify-center">
        <div className="empty-library-card card p-8 max-w-md">
          <Book size={48} className="text-primary mx-auto mb-4" />
          <h2 className="mb-2">Sua Biblioteca Pessoal</h2>
          <p className="text-muted mb-6">Faça login para ter acesso instantâneo a todas as suas obras salvas e contribuições.</p>
          <Link to="/login" className="btn btn-primary w-full py-3">Fazer Login ou Criar Conta</Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container py-20 text-center min-h-screen flex flex-col items-center justify-center">
        <div className="empty-library-card card p-8 max-w-md">
          <Book size={48} className="text-primary mx-auto mb-4" />
          <h2 className="mb-2">Não foi possível carregar sua biblioteca</h2>
          <p className="text-muted mb-6">{loadError}</p>
          <Link to="/catalogo" className="btn btn-primary w-full py-3">Voltar ao Catálogo</Link>
        </div>
      </div>
    );
  }

  const allBooks = [...savedBooks, ...paidBooks];
  const displayedBooks = activeTab === 'salvas'
    ? savedBooks
    : activeTab === 'apoiadas'
      ? paidBooks
      : allBooks;

  return (
    <div className="library-page container py-8">

      {/* Banner de Boas-vindas */}
      <div className="library-hero card p-6 mb-8 bg-surface border">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-primary font-medium mb-1">
              <Sparkles size={16} /> Biblioteca Aberta
            </div>
            <h1 className="text-serif text-2xl font-bold">Olá, {userName}!</h1>
            <p className="text-muted text-sm mt-1">
              Gerencie suas obras salvas, contribua com os artistas quando desejar e acesse seus conteúdos.
            </p>
          </div>
          <Link to="/catalogo" className="btn btn-outline flex items-center gap-2 text-sm">
            <Compass size={16} /> Descobrir Novas Obras
          </Link>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="library-stats-grid mt-6 pt-6 border-t flex flex-wrap gap-4">
          <div className="stat-pill flex-1 min-w-140 p-3 rounded bg-secondary">
            <span className="text-xs text-muted block">Total na Biblioteca</span>
            <strong className="text-lg text-serif">{allBooks.length} obras</strong>
          </div>
          <div className="stat-pill flex-1 min-w-140 p-3 rounded bg-secondary">
            <span className="text-xs text-muted block">Obras Apoiadas</span>
            <strong className="text-lg text-serif text-accent">{paidBooks.length} obras</strong>
          </div>
          <div className="stat-pill flex-1 min-w-140 p-3 rounded bg-secondary">
            <span className="text-xs text-muted block font-medium">Aguardando Apoio</span>
            <strong className="text-lg text-serif text-primary">{savedBooks.length} obras</strong>
          </div>
        </div>
      </div>

      {/* Abas de Filtro */}
      <div className="library-tabs flex items-center gap-2 mb-6 border-b pb-3">
        <button
          className={`tab-btn ${activeTab === 'todas' ? 'active' : ''}`}
          onClick={() => setActiveTab('todas')}
        >
          Todas ({allBooks.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'salvas' ? 'active' : ''}`}
          onClick={() => setActiveTab('salvas')}
        >
          <Clock size={14} /> Salvas para Pagar Depois ({savedBooks.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'apoiadas' ? 'active' : ''}`}
          onClick={() => setActiveTab('apoiadas')}
        >
          <CheckCircle2 size={14} /> Apoiadas ({paidBooks.length})
        </button>
      </div>

      {/* Grid de Obras */}
      {displayedBooks.length === 0 ? (
        <div className="empty-state text-center py-16 card bg-surface">
          <Book size={40} className="text-muted mx-auto mb-3 opacity-60" />
          <h3 className="text-lg mb-1">Nenhuma obra nesta aba</h3>
          <p className="text-muted text-sm mb-6 max-w-sm mx-auto">
            {activeTab === 'salvas'
              ? 'Você não possui nenhuma obra pendente de contribuição.'
              : activeTab === 'apoiadas'
                ? 'Você ainda não fez contribuição em dinheiro para nenhuma obra.'
                : 'Sua biblioteca ainda está vazia.'}
          </p>
          <Link to="/catalogo" className="btn btn-primary text-sm">Explorar o Catálogo</Link>
        </div>
      ) : (
        <div className="library-cards-grid">
          {displayedBooks.map(book => {
            const isPaid = paidBooks.some(pb => pb.id === book.id);
            return (
              <div key={book.id} className="library-item-card card">
                <div className="item-cover-wrapper">
                  <img src={book.coverUrl} alt={book.title} className="item-cover-img" />
                  <span className={`item-badge ${isPaid ? 'badge-paid' : 'badge-saved'}`}>
                    {isPaid ? <><CheckCircle2 size={12} /> Apoio Concluído</> : <><Clock size={12} /> Acesso Aberto</>}
                  </span>
                </div>

                <div className="item-content p-4 flex flex-col">
                  <span className="text-xs text-muted font-medium uppercase tracking-wider mb-1">{book.category}</span>
                  <h3 className="item-title text-serif font-bold text-base mb-1">{book.title}</h3>
                  <p className="item-author text-xs text-muted mb-3">por {book.author}</p>

                  <div className="item-actions mt-auto pt-3 border-t flex flex-col gap-2">
                    {!isPaid ? (
                      <Link to={`/obra/${book.id}`} className="btn btn-primary text-xs py-2 flex items-center justify-center gap-1">
                        <Heart size={14} /> Contribuir com o Artista
                      </Link>
                    ) : (
                      <div className="text-xs text-accent font-medium flex items-center gap-1 mb-1">
                        <CheckCircle2 size={14} /> Obrigado por apoiar esta obra!
                      </div>
                    )}

                    {book.downloadUrl ? (
                      <a
                        href={book.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline text-xs py-2 flex items-center justify-center gap-1"
                      >
                        <Download size={14} /> Baixar / Ler Obra
                      </a>
                    ) : (
                      <Link to={`/obra/${book.id}`} className="btn btn-outline text-xs py-2 text-center">
                        Ver Detalhes da Obra
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}