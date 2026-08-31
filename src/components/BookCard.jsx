import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './BookCard.css';

export default function BookCard({ book }) {
  const [saved, setSaved] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const navigate = useNavigate();

  // Auxiliares para persistência local de obras de teste
  const getLocalSaved = () => {
    try {
      const item = localStorage.getItem('arte_sem_preco_saved_books');
      return item ? JSON.parse(item) : [];
    } catch {
      return [];
    }
  };

  const saveLocalBook = (bookToSave) => {
    const list = getLocalSaved();
    if (!list.some(b => String(b.id) === String(bookToSave.id))) {
      list.push(bookToSave);
      localStorage.setItem('arte_sem_preco_saved_books', JSON.stringify(list));
    }
  };

  const removeLocalBook = (bookId) => {
    const list = getLocalSaved().filter(b => String(b.id) !== String(bookId));
    localStorage.setItem('arte_sem_preco_saved_books', JSON.stringify(list));
  };

  // Verifica se a obra está salva (Local ou Supabase)
  useEffect(() => {
    async function checkSavedState() {
      const localList = getLocalSaved();
      if (localList.some(b => String(b.id) === String(book.id))) {
        setSaved(true);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data } = await supabase
          .from('transacoes')
          .select('id')
          .eq('usuario_id', session.user.id)
          .eq('obra_id', book.id)
          .maybeSingle();

        if (data) {
          setSaved(true);
        }
      } catch (err) {
        // Silencioso
      }
    }

    if (book?.id) {
      checkSavedState();
    }
  }, [book?.id]);

  const handleToggleSave = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Faça login para salvar esta obra na sua biblioteca!');
        navigate('/login');
        return;
      }

      setLoadingSave(true);

      if (saved) {
        removeLocalBook(book.id);
        await supabase
          .from('transacoes')
          .delete()
          .eq('usuario_id', session.user.id)
          .eq('obra_id', book.id);

        setSaved(false);
      } else {
        saveLocalBook(book);

        const { error } = await supabase
          .from('transacoes')
          .insert({
            usuario_id: session.user.id,
            obra_id: book.id,
            valor_pago: 0,
            status: 'concluido'
          });

        if (error) {
          console.log('[BookCard] Obra de demonstração salva em cache local.');
        }

        setSaved(true);
      }
    } catch (err) {
      console.error('Erro ao salvar obra:', err);
      if (!saved) {
        saveLocalBook(book);
        setSaved(true);
      }
    } finally {
      setLoadingSave(false);
    }
  };


  return (
    <div className="card book-card animate-fade-in">
      <Link to={`/obra/${book.id}`} className="book-cover-link">
        <div className="book-cover-container">
          <img src={book.coverUrl} alt={`Capa do livro ${book.title}`} className="book-cover" />
          {book.tags && book.tags.length > 0 && (
            <div className="book-tags flex flex-col gap-2">
              {book.tags.map(tag => (
                <span key={tag} className={tag === 'Arte que Transforma' ? 'badge badge-accent' : 'badge badge-category'}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      
      <div className="book-info flex flex-col flex-1 justify-between">
        <div>
          <span className="book-category text-muted">{book.category}</span>
          <Link to={`/obra/${book.id}`}>
            <h3 className="book-title">{book.title}</h3>
          </Link>
          <p className="book-author text-muted">{book.author}</p>
        </div>
        
        <div className="book-actions flex justify-between items-center">
          <div className="suggested-price">
            <span className="text-muted text-sm">Valor sugerido</span>
            <div className="price-value">
              {Number(book?.suggestedPrice || 0) > 0 
                ? `R$ ${Number(book.suggestedPrice).toFixed(2)}` 
                : 'R$ 0,00'}
            </div>
          </div>
          <button 
            type="button"
            className={`favorite-btn ${saved ? 'saved' : ''}`}
            onClick={handleToggleSave}
            disabled={loadingSave}
            title={saved ? "Salvo na sua biblioteca (clique para remover)" : "Salvar na sua biblioteca"}
            aria-label="Salvar na biblioteca"
          >
            {loadingSave ? (
              <Loader2 size={18} className="animate-spin text-primary" />
            ) : (
              <Heart 
                size={20} 
                className={saved ? "heart-icon-saved" : ""}
                fill={saved ? "#ef4444" : "none"} 
                color={saved ? "#ef4444" : "currentColor"} 
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

