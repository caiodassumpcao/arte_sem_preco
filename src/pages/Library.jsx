import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Book, CheckCircle2, Loader2, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Library.css';

export default function Library() {
  const [savedBooks, setSavedBooks] = useState([]);
  const [paidBooks, setPaidBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function fetchLibrary() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }
        
        setUser(session.user);

        const { data, error } = await supabase
          .from('transacoes')
          .select(`
            valor_pago,
            obras (
              id,
              titulo,
              url_capa,
              url_arquivo,
              usuarios(nome),
              categorias(nome)
            )
          `)
          .eq('usuario_id', session.user.id)
          .eq('status', 'concluido');

        if (error) throw error;

        if (data) {
          const saved = [];
          const paid = [];

          data.forEach(t => {
            if (!t.obras) return;
            const b = {
              id: t.obras.id,
              title: t.obras.titulo,
              author: t.obras.usuarios?.nome || 'Autor',
              category: t.obras.categorias?.nome || 'Categoria',
              coverUrl: t.obras.url_capa || '/src/assets/placeholder.png',
              downloadUrl: t.obras.url_arquivo
            };
            
            if (Number(t.valor_pago) > 0) {
              paid.push(b);
            } else {
              saved.push(b);
            }
          });
          
          // Remove duplicatas se salvou e depois pagou
          const uniquePaidIds = new Set(paid.map(b => b.id));
          const filteredSaved = saved.filter(b => !uniquePaidIds.has(b.id));
          
          // Filtra duplicatas dentro das próprias listas
          const uniquePaid = [...new Map(paid.map(item => [item.id, item])).values()];
          const uniqueSaved = [...new Map(filteredSaved.map(item => [item.id, item])).values()];

          setPaidBooks(uniquePaid);
          setSavedBooks(uniqueSaved);
        }
      } catch (err) {
        console.error('Erro ao buscar biblioteca:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLibrary();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h2 className="mb-4">Sua Biblioteca</h2>
        <p className="text-muted mb-8">Faça login para ver as obras que você salvou ou apoiou.</p>
        <Link to="/login" className="btn btn-primary">Fazer Login</Link>
      </div>
    );
  }

  return (
    <div className="library-page container py-8">
      <div className="library-header mb-8 text-center">
        <h1 className="text-serif mb-2">Minha Biblioteca</h1>
        <p className="text-muted">Acesse suas obras salvas e retribua aos artistas quando puder.</p>
      </div>

      <div className="library-section mb-12">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <Book className="text-primary" />
          Salvas para Pagar Depois
        </h2>
        <div className="library-grid">
          {savedBooks.length === 0 ? (
            <p className="text-muted col-span-full">Nenhuma obra salva para depois.</p>
          ) : (
            savedBooks.map(book => (
              <div key={book.id} className="library-card card">
                <img src={book.coverUrl} alt={book.title} className="lib-cover" />
                <div className="lib-info flex flex-col p-4">
                  <span className="text-xs text-muted uppercase">{book.category}</span>
                  <h3 className="lib-title">{book.title}</h3>
                  <p className="text-sm text-muted mb-4">{book.author}</p>
                  
                  <Link to={`/obra/${book.id}`} className="btn btn-primary mt-auto text-sm">
                    Contribuir Agora
                  </Link>
                  {book.downloadUrl ? (
                    <a href={book.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-outline text-sm mt-2 flex justify-center items-center gap-2">
                      <Download size={14} /> Baixar Novamente
                    </a>
                  ) : (
                    <button className="btn btn-outline text-sm mt-2" onClick={() => alert('Download indisponível no momento.')}>
                      Indisponível
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="library-section">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <CheckCircle2 className="text-accent" />
          Apoiadas
        </h2>
        <div className="library-grid opacity-80">
          {paidBooks.length === 0 ? (
            <p className="text-muted col-span-full">Nenhuma obra apoiada ainda. Que tal explorar o catálogo?</p>
          ) : (
            paidBooks.map(book => (
              <div key={book.id} className="library-card card">
                <img src={book.coverUrl} alt={book.title} className="lib-cover" />
                <div className="lib-info flex flex-col p-4">
                  <span className="text-xs text-muted uppercase">{book.category}</span>
                  <h3 className="lib-title">{book.title}</h3>
                  <p className="text-sm text-muted mb-4">{book.author}</p>
                  
                  <span className="badge badge-accent mt-auto self-start">Apoio Realizado</span>
                  {book.downloadUrl ? (
                    <a href={book.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-outline text-sm mt-4 flex justify-center items-center gap-2">
                      <Download size={14} /> Baixar Novamente
                    </a>
                  ) : (
                    <button className="btn btn-outline text-sm mt-4" onClick={() => alert('Download indisponível no momento.')}>
                      Indisponível
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
