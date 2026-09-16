import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Clock, XCircle, Download, BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Success.css';

const MAX_TENTATIVAS = 6;
const INTERVALO_MS = 2500;

export default function Success() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request_id');
  const obraIdParam = searchParams.get('obra_id');

  const [book, setBook] = useState(null);
  const [statusTransacao, setStatusTransacao] = useState(null); // pendente | concluido | falhou | ...
  const [valorPago, setValorPago] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [erro, setErro] = useState(null);

  const carregarObra = useCallback(async (obraId) => {
    if (!obraId) return null;
    const { data, error } = await supabase
      .from('obras')
      .select('id, titulo, capa_url, arquivo_url')
      .eq('id', obraId)
      .maybeSingle();

    if (error) {
      console.error('[Success] Erro ao carregar obra:', error.message);
      return null;
    }
    if (!data) return null;

    return {
      id: data.id,
      title: data.titulo,
      coverUrl: data.capa_url || null,
      downloadUrl: data.arquivo_url || null,
    };
  }, []);

  // ----------------------------------------------------------------------
  // Fluxo com request_id: consulta a transação e faz polling enquanto o
  // webhook do Mercado Pago não confirmar o pagamento.
  // ----------------------------------------------------------------------
  useEffect(() => {
    let ativo = true;
    let timer;

    async function verificar() {
      try {
        // Sem request_id é o fluxo de acesso gratuito (?obra_id=...)
        if (!requestId) {
          const obra = await carregarObra(obraIdParam);
          if (!ativo) return;
          setBook(obra);
          setStatusTransacao(obra ? 'concluido' : null);
          if (!obra) setErro('Não foi possível identificar a obra.');
          setLoading(false);
          return;
        }

        const { data: transacao, error } = await supabase
          .from('transacoes')
          .select('status, valor_pago, obra_id')
          .eq('request_id', requestId)
          .maybeSingle();

        if (error) {
          console.error('[Success] Erro ao consultar transação:', error.message);
          if (!ativo) return;
          setErro('Não foi possível verificar o pagamento agora.');
          setLoading(false);
          return;
        }

        if (!transacao) {
          if (!ativo) return;
          setErro('Pagamento não encontrado. Se você foi cobrado, entre em contato.');
          setLoading(false);
          return;
        }

        if (!ativo) return;
        setStatusTransacao(transacao.status);
        setValorPago(Number(transacao.valor_pago || 0));

        if (!book) {
          const obra = await carregarObra(transacao.obra_id || obraIdParam);
          if (!ativo) return;
          setBook(obra);
        }

        // Pix e cartão podem levar alguns segundos para o webhook chegar.
        if (transacao.status === 'pendente' && tentativa < MAX_TENTATIVAS) {
          timer = setTimeout(() => ativo && setTentativa((t) => t + 1), INTERVALO_MS);
        }

        setLoading(false);
      } catch (err) {
        console.error('[Success] Falha inesperada:', err);
        if (!ativo) return;
        setErro('Falha inesperada ao verificar o pagamento.');
        setLoading(false);
      }
    }

    verificar();
    return () => { ativo = false; if (timer) clearTimeout(timer); };
    // `tentativa` reexecuta o polling; `book` é lido de forma tolerante acima
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, obraIdParam, tentativa, carregarObra]);

  if (loading) {
    return (
      <div className="success-loading">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  const confirmando = statusTransacao === 'pendente';
  const concluido = statusTransacao === 'concluido';
  const falhou = ['falhou', 'estornado', 'contestado'].includes(statusTransacao);
  const aindaAguardando = confirmando && tentativa < MAX_TENTATIVAS;
  const acessoLiberado = concluido;

  let Icone = CheckCircle;
  let iconeClasse = 'text-primary';
  if (confirmando) { Icone = Clock; iconeClasse = 'text-accent'; }
  if (falhou) { Icone = XCircle; iconeClasse = 'text-danger'; }

  let titulo = 'Contribuição confirmada!';
  let mensagem = 'Obrigado por apoiar a cultura e valorizar o trabalho dos artistas independentes.';

  if (confirmando && aindaAguardando) {
    titulo = 'Confirmando seu pagamento…';
    mensagem = 'Estamos aguardando a confirmação do Mercado Pago. Isso costuma levar poucos segundos.';
  } else if (confirmando) {
    titulo = 'Pagamento em processamento';
    mensagem = 'Seu pagamento ainda está sendo processado. A obra aparecerá na sua biblioteca assim que for confirmado — você pode fechar esta página.';
  } else if (falhou) {
    titulo = statusTransacao === 'estornado' ? 'Contribuição estornada' : 'Pagamento não concluído';
    mensagem = 'Nenhum valor foi confirmado. Você pode tentar novamente pela página da obra.';
  } else if (requestId && concluido && valorPago > 0) {
    mensagem = `Sua contribuição de R$ ${valorPago.toFixed(2)} foi confirmada. 90% vai para o artista.`;
  } else if (!requestId) {
    titulo = 'Acesso liberado!';
    mensagem = 'A obra já está na sua biblioteca. Você pode contribuir quando quiser.';
  }

  return (
    <div className="container py-12 success-page">
      <div className="success-card card">
        <Icone size={64} className={`${iconeClasse} success-icon`} />

        <h1 className="success-title">{titulo}</h1>
        <p className="text-muted success-message">{mensagem}</p>

        {aindaAguardando && (
          <div className="success-polling">
            <Loader2 className="animate-spin" size={16} />
            <span>Verificando… ({tentativa + 1}/{MAX_TENTATIVAS + 1})</span>
          </div>
        )}

        {erro && <p className="success-error">{erro}</p>}

        {book && (
          <div className="success-book">
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className="success-book-cover" />
            ) : (
              <div className="success-book-cover success-book-cover--empty">
                <BookOpen size={24} />
              </div>
            )}
            <div className="success-book-info">
              <h3 className="success-book-title">{book.title}</h3>

              {acessoLiberado ? (
                <p className="text-muted success-book-note">Acesso liberado à obra.</p>
              ) : (
                <p className="text-muted success-book-note">
                  O download é liberado assim que o pagamento for confirmado.
                </p>
              )}

              <div className="success-actions">
                {acessoLiberado && book.downloadUrl && (
                  <a
                    href={book.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary success-action-btn"
                  >
                    <Download size={18} /> Baixar Arquivo
                  </a>
                )}
                {acessoLiberado && !book.downloadUrl && (
                  <span className="success-no-file text-muted">
                    Esta obra ainda não tem arquivo publicado pelo autor.
                  </span>
                )}
                <Link to="/minha-biblioteca" className="btn btn-outline success-action-btn">
                  <BookOpen size={18} /> Minha Biblioteca
                </Link>
              </div>
            </div>
          </div>
        )}

        {falhou && book && (
          <Link to={`/obra/${book.id}`} className="btn btn-primary success-retry">
            Tentar contribuir novamente
          </Link>
        )}

        <Link to="/catalogo" className="text-primary success-back">
          Voltar ao Catálogo
        </Link>
      </div>
    </div>
  );
}
