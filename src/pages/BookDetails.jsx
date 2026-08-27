import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Heart, Download, BookOpen, User, Info, Check, Loader2 } from 'lucide-react';
import { getBookById } from '../data/mockData';
import { supabase } from '../lib/supabase';
import './BookDetails.css';

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [contribution, setContribution] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  useEffect(() => {
    async function fetchBookDetails() {
      try {
        // Se o ID não for um UUID válido, assumimos que é mockData (ID numérico)
        // Isso permite que o fallback continue funcionando enquanto testamos
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        
        if (isUUID) {
          const { data, error } = await supabase
            .from('obras')
            .select(`
              id,
              titulo,
              sinopse,
              preco_sugerido,
              url_capa,
              tags,
              causa_id,
              usuarios(nome),
              categorias(nome)
            `)
            .eq('id', id)
            .single();
          
          if (error) throw error;
          
          if (data) {
            const formattedBook = {
              id: data.id,
              title: data.titulo,
              author: data.usuarios?.nome || 'Autor Desconhecido',
              category: data.categorias?.nome || 'Sem Categoria',
              synopsis: data.sinopse,
              coverUrl: data.url_capa || '/src/assets/placeholder.png',
              suggestedPrice: Number(data.preco_sugerido),
              tags: data.tags || [],
              cause: data.causa_id || null
            };
            setBook(formattedBook);
            setContribution(formattedBook.suggestedPrice);
          }
        } else {
          // Fallback para mock data
          const mock = getBookById(id);
          if (mock) {
            setBook(mock);
            setContribution(mock.suggestedPrice);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar detalhes da obra:', err.message);
        // Fallback tentar mock
        const mock = getBookById(id);
        if (mock) {
          setBook(mock);
          setContribution(mock.suggestedPrice);
        }
      } finally {
        setLoading(false);
      }
    }
    
    fetchBookDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ minHeight: '60vh' }}>
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="container py-8 text-center" style={{ minHeight: '60vh' }}>
        <h2 className="mt-12">Obra não encontrada</h2>
        <Link to="/catalogo" className="btn btn-primary mt-4">Voltar ao Catálogo</Link>
      </div>
    );
  }

  const artistSplit = (contribution * 0.9).toFixed(2);
  const platformSplit = (contribution * 0.1).toFixed(2);

  const handlePayment = async () => {
    setIsProcessingPayment(true);
    setPaymentError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user?.id || 'guest';

      const { data, error } = await supabase.functions.invoke('create_preference', {
        body: { 
          obra_id: book.id, 
          valor: contribution, 
          titulo: book.title, 
          user_id 
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao comunicar com o servidor');
      }

      if (data?.init_point) {
        window.location.href = data.init_point;
      } else if (data?.error) {
        throw new Error(data.error);
      } else {
        throw new Error('Link de pagamento não retornado');
      }
    } catch (err) {
      console.error('Erro no pagamento:', err);
      setPaymentError(err.message || 'Ocorreu um erro ao processar seu pagamento. Tente novamente.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleSaveLater = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Você precisa fazer login para salvar obras na sua biblioteca.');
        navigate('/login');
        return;
      }

      if (saved) return;

      const { error } = await supabase
        .from('transacoes')
        .insert({
          usuario_id: session.user.id,
          obra_id: book.id,
          valor_pago: 0,
          status: 'concluido'
        });

      if (error) throw error;
      setSaved(true);
      alert('Obra salva na sua biblioteca para contribuir depois!');
    } catch (err) {
      console.error('Erro ao salvar obra:', err);
      alert('Não foi possível salvar a obra no momento.');
    }
  };

  const handleDirectDownload = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Faça login ou cadastre-se rapidamente para acessar a obra gratuitamente.');
        navigate('/login');
        return;
      }

      const { error } = await supabase
        .from('transacoes')
        .insert({
          usuario_id: session.user.id,
          obra_id: book.id,
          valor_pago: 0,
          status: 'concluido'
        });
        
      if (error) throw error;
      navigate(`/sucesso?obra_id=${book.id}&status=approved`);
    } catch (err) {
      console.error('Erro no download direto:', err);
      alert('Não foi possível liberar o download no momento.');
    }
  };

  return (
    <div className="book-details-page">
      <div className="container py-8">
        <div className="book-layout">
          {/* Left Column: Cover */}
          <div className="book-cover-col">
            <div className="detail-cover-container">
              <img src={book.coverUrl} alt={`Capa de ${book.title}`} className="detail-cover" />
            </div>
            <div className="book-meta-list flex flex-col gap-4 mt-6">
              <div className="meta-item flex gap-2">
                <BookOpen size={18} className="text-muted" />
                <span className="text-muted">Categoria:</span> 
                <strong>{book.category}</strong>
              </div>
              <div className="meta-item flex gap-2">
                <User size={18} className="text-muted" />
                <span className="text-muted">Autor:</span> 
                <strong>{book.author}</strong>
              </div>
              {book.cause && (
                <div className="meta-item flex gap-2">
                  <Heart size={18} className="text-accent" />
                  <span className="text-accent font-medium">Apoia: {book.cause}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column: Info & Actions */}
          <div className="book-info-col">
            <div className="flex gap-2 mb-4">
              {book.tags?.map(tag => (
                <span key={tag} className={tag === 'Arte que Transforma' ? 'badge badge-accent' : 'badge badge-category'}>
                  {tag}
                </span>
              ))}
            </div>
            
            <h1 className="detail-title text-serif">{book.title}</h1>
            <p className="detail-author text-muted text-lg mb-6">por {book.author}</p>
            
            <div className="detail-synopsis mb-8">
              <h3 className="mb-4">Sinopse</h3>
              <p>{book.synopsis}</p>
            </div>
            
            <div className="contribution-widget card mb-8">
              <div className="widget-header bg-secondary p-4">
                <h3 className="flex items-center gap-2">
                  Acesso Aberto
                </h3>
                <p className="text-sm mt-1">A arte tem valor. O preço, você decide.</p>
              </div>
              
              <div className="widget-body p-6">
                <div className="contribution-input-group mb-6">
                  <label className="text-sm font-medium mb-2 block">Contribuição Voluntária (R$)</label>
                  <div className="flex items-center gap-4">
                    <button className={`preset-btn ${contribution === 0 ? 'active' : ''}`} onClick={() => setContribution(0)}>R$ 0</button>
                    <button className={`preset-btn ${contribution === book.suggestedPrice / 2 ? 'active' : ''}`} onClick={() => setContribution(book.suggestedPrice / 2)}>R$ {(book.suggestedPrice / 2).toFixed(2)}</button>
                    <button className={`preset-btn ${contribution === book.suggestedPrice ? 'active' : ''}`} onClick={() => setContribution(book.suggestedPrice)}>R$ {book.suggestedPrice.toFixed(2)}</button>
                    <div className="custom-input-wrapper flex-1">
                      <span className="currency-symbol">R$</span>
                      <input 
                        type="number" 
                        min="0"
                        step="0.5"
                        value={contribution}
                        onChange={(e) => setContribution(Number(e.target.value))}
                        className="custom-input"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="split-preview flex justify-between bg-surface border rounded p-4 mb-6">
                  <div className="split-item">
                    <span className="block text-sm text-muted mb-1">Para o artista</span>
                    <strong className="text-primary text-lg">R$ {artistSplit}</strong>
                    <span className="block text-xs text-muted">(90%)</span>
                  </div>
                  <div className="split-item text-right">
                    <span className="block text-sm text-muted mb-1">Para a plataforma</span>
                    <strong className="text-lg">R$ {platformSplit}</strong>
                    <span className="block text-xs text-muted">(10%)</span>
                  </div>
                </div>
                
                <div className="action-buttons flex gap-4">
                  {contribution > 0 ? (
                    <button className="btn btn-primary flex-1 py-3 text-lg" onClick={() => setShowModal(true)}>
                      Contribuir e Baixar
                    </button>
                  ) : (
                    <button className="btn btn-primary flex-1 py-3 text-lg" onClick={handleDirectDownload}>
                      Baixar Diretamente
                    </button>
                  )}
                  <button 
                    className={`btn ${saved ? 'btn-outline text-primary border-primary' : 'btn-outline'}`}
                    onClick={handleSaveLater}
                    title={saved ? "Salvo na Biblioteca" : "Salvar para Pagar Depois"}
                  >
                    {saved ? <Check size={24} /> : <Heart size={24} />}
                  </button>
                </div>
                <p className="text-xs text-center text-muted mt-4 flex items-center justify-center gap-1">
                  <Info size={12} /> Salve na biblioteca para contribuir em outro momento.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Payment Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h2 className="mb-4">Escolher forma de contribuição</h2>
            <p className="mb-6 text-muted">Você está contribuindo com <strong>R$ {contribution.toFixed(2)}</strong> para "{book.title}".</p>
            
            {paymentError && (
              <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm border border-red-200">
                {paymentError}
              </div>
            )}
            
            <div className="flex flex-col gap-4">
              <button 
                className="btn btn-primary justify-center py-4 flex gap-2 items-center" 
                onClick={handlePayment}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Gerando pagamento...</span>
                  </>
                ) : (
                  <span>Pagar com Pix ou Cartão</span>
                )}
              </button>
            </div>
            
            <button 
              className="btn btn-block mt-6" 
              onClick={() => setShowModal(false)}
              disabled={isProcessingPayment}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
