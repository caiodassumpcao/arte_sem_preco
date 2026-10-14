import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Heart, BookOpen, User, Info, Check, Loader2, AlertCircle, QrCode, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CATEGORIAS_SELECT, nomesDasCategorias } from '../lib/categorias';
import { catalogoDoAutor } from '../lib/rotas';
import { useAuth } from '../contexts/AuthContext';
import './BookDetails.css';

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const pagamentoFalhou = searchParams.get('error') === 'payment_failed';
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);

  const [contribution, setContribution] = useState(0);
  // Texto do campo, separado do número: com value numérico o React não
  // reescreve "011" (== 11) e o zero à esquerda fica visível.
  const [valorDigitado, setValorDigitado] = useState('0');
  const [showModal, setShowModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  // Pix é o padrão: taxa menor, confirmação imediata e sem fricção de cartão.
  const [metodo, setMetodo] = useState('pix');

  useEffect(() => {
    let ativo = true;

    async function fetchBookDetails() {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('obras')
          .select(`
            id,
            titulo,
            autor_id,
            descricao,
            preco,
            capa_url,
            arquivo_url,
            tags,
            causa_id,
            usuarios(nome),
            ${CATEGORIAS_SELECT},
            causas(nome)
          `)
          .eq('id', id)
          .maybeSingle();

        if (!ativo) return;

        if (error) {
          console.error('[BookDetails] Erro na consulta:', error.message);
          setBook(null);
          return;
        }

        if (!data) {
          setBook(null);
          return;
        }

        const preco = Number(data.preco || 0);
        const categories = nomesDasCategorias(data);
        setBook({
          id: data.id,
          title: data.titulo,
          author: data.usuarios?.nome || 'Autor Desconhecido',
          autorId: data.autor_id,
          category: categories[0] || 'Sem Categoria',
          categories,
          synopsis: data.descricao,
          coverUrl: data.capa_url || null,
          downloadUrl: data.arquivo_url,
          suggestedPrice: preco,
          tags: data.tags || [],
          cause: data.causas?.nome || null,
        });
        const inicial = preco > 0 ? preco : 15;
        setContribution(inicial);
        setValorDigitado(String(inicial));
      } catch (err) {
        console.error('[BookDetails] Falha ao buscar obra:', err);
        if (ativo) setBook(null);
      } finally {
        if (ativo) setLoading(false);
      }
    }

    fetchBookDetails();
    return () => { ativo = false; };
  }, [id]);

  // Verifica se a obra já está salva na biblioteca do usuário
  useEffect(() => {
    async function checkSavedState() {
      if (!book?.id) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase
          .from('transacoes')
          .select('id')
          .eq('usuario_id', session.user.id)
          .eq('obra_id', book.id)
          .eq('status', 'concluido')
          .limit(1);

        if (error) {
          console.error('[BookDetails] Erro ao verificar estado salvo:', error.message);
          return;
        }

        if (data && data.length > 0) setSaved(true);
      } catch (e) {
        console.error('[BookDetails] Falha ao verificar biblioteca:', e);
      }
    }

    checkSavedState();
  }, [book?.id]);

  if (loading) {
    return (
      <div className="page-loading">
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

  const base = book.suggestedPrice > 0 ? book.suggestedPrice : 15;
  const presets = [
    { rotulo: 'R$ 0', valor: 0 },
    { rotulo: `R$ ${(base / 2).toFixed(2)}`, valor: Math.round((base / 2) * 100) / 100 },
    { rotulo: `R$ ${base.toFixed(2)}`, valor: base },
  ];

  // Abre o Checkout Pro numa aba nova e leva a nossa aba direto pra /sucesso,
  // que já faz polling por request_id. Assim o download não depende do MP
  // redirecionar de volta: mesmo que o contribuinte feche a aba de pagamento
  // sem voltar, a nossa aba detecta a confirmação sozinha pelo webhook.
  //
  // A aba é aberta ANTES do await (gesto síncrono do clique), senão o
  // navegador trata como pop-up e bloqueia.
  const handlePayment = async (metodoEscolhido) => {
    if (isProcessingPayment) return;
    setIsProcessingPayment(true);
    setPaymentError(null);

    const abaPagamento = window.open('', '_blank');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        abaPagamento?.close();
        navigate('/login', { state: { from: `/obra/${book.id}` } });
        return;
      }

      // user_id NÃO é enviado: a Edge Function o extrai do JWT.
      const { data, error } = await supabase.functions.invoke('create_preference', {
        body: {
          obra_id: book.id,
          valor: contribution,
          metodo: metodoEscolhido,
        },
      });

      if (error) {
        // A Edge Function devolve { error } no corpo; tenta extrair a mensagem.
        let detalhe = null;
        try { detalhe = (await error.context?.json?.())?.error; } catch { /* corpo não-JSON */ }
        throw new Error(detalhe || error.message || 'Erro ao gerar o pagamento.');
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.init_point) throw new Error('Link de pagamento não retornado pelo gateway.');

      if (abaPagamento) {
        abaPagamento.location.href = data.init_point;
        setShowModal(false);
        navigate(`/sucesso?request_id=${data.request_id}&obra_id=${book.id}`);
      } else {
        // Pop-up bloqueado: cai para o redirecionamento na mesma aba.
        window.location.href = data.init_point;
      }
    } catch (err) {
      abaPagamento?.close();
      console.error('[BookDetails] Erro no pagamento:', err);
      setPaymentError(err.message || 'Ocorreu um erro ao processar seu pagamento.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const abrirModalContribuicao = () => {
    if (!user) {
      navigate('/login', { state: { from: `/obra/${book.id}` } });
      return;
    }
    setPaymentError(null);
    setMetodo('pix');
    setShowModal(true);
  };

  const handleSaveLater = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login', { state: { from: `/obra/${book.id}` } });
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

      if (error) {
        console.error('[BookDetails] Erro ao salvar obra:', error.message);
        setActionMsg({ tipo: 'erro', texto: 'Não foi possível salvar a obra. Tente novamente.' });
        return;
      }

      setSaved(true);
      setActionMsg({ tipo: 'ok', texto: 'Obra salva na sua biblioteca para contribuir depois.' });
    } catch (err) {
      console.error('[BookDetails] Erro inesperado ao salvar:', err);
      setActionMsg({ tipo: 'erro', texto: 'Erro inesperado ao salvar a obra.' });
    }
  };

  const handleDirectDownload = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login', { state: { from: `/obra/${book.id}` } });
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

      // 23505 = unique_violation: o acesso gratuito já estava registrado.
      if (error && error.code !== '23505') {
        console.error('[BookDetails] Erro ao registrar acesso:', error.message);
        setActionMsg({ tipo: 'erro', texto: 'Não foi possível registrar o acesso. Tente novamente.' });
        return;
      }

      navigate(`/sucesso?obra_id=${book.id}`);
    } catch (err) {
      console.error('[BookDetails] Erro inesperado no acesso:', err);
      setActionMsg({ tipo: 'erro', texto: 'Erro inesperado ao acessar a obra.' });
    }
  };

  return (
    <div className="book-details-page">
      <div className="container py-8">
        <div className="book-layout">
          {/* Left Column: Cover */}
          <div className="book-cover-col">
            <div className="detail-cover-container">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={`Capa de ${book.title}`}
                  className="detail-cover"
                  loading="lazy"
                />
              ) : (
                <div className="detail-cover detail-cover--empty">
                  <BookOpen size={40} />
                  <span>Sem capa</span>
                </div>
              )}
            </div>
            <div className="book-meta-list flex flex-col gap-4 mt-6">
              <div className="meta-item flex gap-2">
                <BookOpen size={18} className="text-muted" />
                <span className="text-muted">{book.categories.length > 1 ? 'Categorias:' : 'Categoria:'}</span>
                <strong>{book.categories.length > 0 ? book.categories.join(', ') : book.category}</strong>
              </div>
              <div className="meta-item flex gap-2">
                <User size={18} className="text-muted" />
                <span className="text-muted">Autor:</span>
                <Link to={catalogoDoAutor(book.autorId, book.author)} className="author-link" title={`Ver todas as obras de ${book.author}`}>
                  <strong>{book.author}</strong>
                </Link>
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

            {pagamentoFalhou && (
              <div className="detail-alert detail-alert--erro">
                <AlertCircle size={16} />
                <span>O pagamento não foi concluído. Nenhum valor foi cobrado — você pode tentar novamente.</span>
              </div>
            )}

            <h1 className="detail-title text-serif">{book.title}</h1>
            <p className="detail-author text-muted text-lg mb-6">
              por{' '}
              <Link to={catalogoDoAutor(book.autorId, book.author)} className="author-link" title={`Ver todas as obras de ${book.author}`}>
                {book.author}
              </Link>
            </p>

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
                  <label className="text-sm font-medium mb-2 block" htmlFor="valor-contribuicao">
                    Contribuição Voluntária (R$)
                  </label>
                  <div className="preset-grid">
                    {presets.map(({ rotulo, valor }) => (
                      <button
                        key={rotulo}
                        type="button"
                        className={`preset-btn ${contribution === valor ? 'active' : ''}`}
                        onClick={() => {
                          setContribution(valor);
                          setValorDigitado(String(valor));
                        }}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="custom-input-wrapper">
                    <span className="currency-symbol">R$</span>
                    <input
                      id="valor-contribuicao"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="10000"
                      step="0.5"
                      value={valorDigitado}
                      onChange={(e) => {
                        // Remove zeros à esquerda ("011" → "11"), mas mantém "0.5".
                        let texto = e.target.value.replace(/^0+(?=\d)/, '');
                        const numero = Number(texto) || 0;
                        if (numero < 0) texto = '0';
                        setValorDigitado(texto);
                        setContribution(Math.max(0, numero));
                      }}
                      className="custom-input"
                      aria-label="Valor personalizado da contribuição"
                    />
                  </div>
                </div>

                <div className="split-preview bg-surface border rounded p-4 mb-6">
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

                <div className="action-buttons">
                  {contribution > 0 ? (
                    <button type="button" className="btn btn-primary btn-grow py-3 text-lg" onClick={abrirModalContribuicao}>
                      Contribuir e Baixar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary btn-grow py-3 text-lg" onClick={handleDirectDownload}>
                      Acessar Gratuitamente
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn btn-outline btn-icon ${saved ? 'btn-icon--ativo' : ''}`}
                    onClick={handleSaveLater}
                    aria-label={saved ? 'Salvo na biblioteca' : 'Salvar para pagar depois'}
                    title={saved ? 'Salvo na Biblioteca' : 'Salvar para Pagar Depois'}
                  >
                    {saved ? <Check size={24} /> : <Heart size={24} />}
                  </button>
                </div>

                {actionMsg && (
                  <div className={`detail-alert ${actionMsg.tipo === 'erro' ? 'detail-alert--erro' : 'detail-alert--ok'}`}>
                    {actionMsg.tipo === 'erro' ? <AlertCircle size={16} /> : <Check size={16} />}
                    <span>{actionMsg.texto}</span>
                  </div>
                )}
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

            <div className="metodo-tabs" role="tablist" aria-label="Forma de pagamento">
              <button
                type="button"
                role="tab"
                aria-selected={metodo === 'pix'}
                className={`metodo-tab ${metodo === 'pix' ? 'active' : ''}`}
                onClick={() => setMetodo('pix')}
              >
                <QrCode size={16} /> Pix
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={metodo === 'cartao'}
                className={`metodo-tab ${metodo === 'cartao' ? 'active' : ''}`}
                onClick={() => setMetodo('cartao')}
              >
                <CreditCard size={16} /> Cartão
              </button>
            </div>

            {paymentError && (
              <div className="modal-alert">
                <p className="modal-alert-text">{paymentError}</p>
              </div>
            )}

            <p className="modal-nota">
              {metodo === 'pix'
                ? 'Você vai gerar o QR Code numa aba nova do Mercado Pago. Pode fechar essa aba depois de pagar: liberamos o acesso assim que a confirmação chegar, sem precisar voltar pra ela.'
                : 'Você será levado ao ambiente seguro do Mercado Pago, numa aba nova, para informar os dados do cartão.'}
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary modal-pay-btn"
                onClick={() => handlePayment(metodo)}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Gerando pagamento...</span>
                  </>
                ) : (
                  <span>{metodo === 'pix' ? 'Gerar QR Code Pix' : 'Pagar com cartão'}</span>
                )}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-outline btn-block mt-6"
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