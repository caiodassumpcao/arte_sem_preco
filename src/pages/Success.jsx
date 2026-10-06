import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Clock, XCircle, Download, BookOpen, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Success.css';

// Pix e cartão são concluídos em outra aba e podem levar minutos (abrir o app
// do banco, digitar o cartão). Verifica rápido no começo, depois espaça.
const RAPIDO_MS = 4000;
const LENTO_MS = 10000;
const FASE_RAPIDA_MS = 2 * 60 * 1000;
const LIMITE_MS = 15 * 60 * 1000;

export default function Success() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request_id');
  const obraIdParam = searchParams.get('obra_id');

  const [book, setBook] = useState(null);
  const [statusTransacao, setStatusTransacao] = useState(null); // pendente | concluido | falhou | ...
  const [valorPago, setValorPago] = useState(null);
  const [pagamentoIniciado, setPagamentoIniciado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [encerrado, setEncerrado] = useState(false);
  const [erro, setErro] = useState(null);

  const [inicio] = useState(() => Date.now());
  const statusRef = useRef(null);
  useEffect(() => { statusRef.current = statusTransacao; }, [statusTransacao]);

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

  // Pergunta ao servidor, que consulta o Mercado Pago direto (não depende do
  // webhook ter chegado). Se a função falhar, cai para a leitura da transação.
  const verificar = useCallback(async () => {
    if (!requestId) return;
    setVerificando(true);
    try {
      const { data, error } = await supabase.functions.invoke('verificar_pagamento', {
        body: { request_id: requestId },
      });

      if (!error && data?.status) {
        setStatusTransacao(data.status);
        setValorPago(Number(data.valor_pago || 0));
        if (typeof data.pagamento_iniciado === 'boolean') setPagamentoIniciado(data.pagamento_iniciado);
        setErro(null);
        return;
      }

      let detalhe = null;
      try { detalhe = (await error?.context?.json?.())?.error; } catch { /* corpo não-JSON */ }
      if (error?.context?.status === 404) {
        setErro(detalhe || 'Pagamento não encontrado. Se você foi cobrado, entre em contato.');
        return;
      }

      const { data: transacao } = await supabase
        .from('transacoes')
        .select('status, valor_pago')
        .eq('request_id', requestId)
        .maybeSingle();
      if (transacao) {
        setStatusTransacao(transacao.status);
        setValorPago(Number(transacao.valor_pago || 0));
      }
    } catch (err) {
      console.error('[Success] Falha ao verificar pagamento:', err);
    } finally {
      setVerificando(false);
    }
  }, [requestId]);

  // Carga inicial: obra + primeira verificação.
  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      let obraId = obraIdParam;
      if (requestId && !obraId) {
        const { data } = await supabase
          .from('transacoes')
          .select('obra_id')
          .eq('request_id', requestId)
          .maybeSingle();
        obraId = data?.obra_id ?? null;
      }

      const obra = await carregarObra(obraId);
      if (!ativo) return;
      setBook(obra);
      if (!obra) setErro('Não foi possível identificar a obra.');

      if (requestId) {
        await verificar();
      } else {
        // Fluxo de acesso aberto (?obra_id=...): nada a confirmar.
        setStatusTransacao(obra ? 'concluido' : null);
      }
      if (ativo) setLoading(false);
    }

    iniciar();
    return () => { ativo = false; };
  }, [requestId, obraIdParam, carregarObra, verificar]);

  // Verificação periódica enquanto pendente, até o limite.
  useEffect(() => {
    if (!requestId || loading || verificando || statusTransacao !== 'pendente' || encerrado) return;

    const decorrido = Date.now() - inicio;
    const timer = setTimeout(() => {
      if (Date.now() - inicio > LIMITE_MS) setEncerrado(true);
      else verificar();
    }, decorrido < FASE_RAPIDA_MS ? RAPIDO_MS : LENTO_MS);
    return () => clearTimeout(timer);
    // `verificando` reagenda depois de cada verificação terminar.
  }, [requestId, loading, statusTransacao, encerrado, verificando, verificar, inicio]);

  // Quem paga volta para esta aba depois de concluir no Mercado Pago:
  // verifica na hora em vez de esperar o próximo ciclo.
  useEffect(() => {
    if (!requestId) return;
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'pendente') verificar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [requestId, verificar]);

  // O acesso nunca depende do pagamento: o botão de download está sempre
  // disponível. O clique registra a obra na biblioteca (acesso aberto, R$ 0)
  // sem atrasar a abertura do arquivo, que segue o link normalmente.
  const registrarAcesso = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !book) return;
      const { error } = await supabase.from('transacoes').insert({
        usuario_id: session.user.id,
        obra_id: book.id,
        valor_pago: 0,
        status: 'concluido',
      });
      // 23505 = o acesso aberto já estava registrado.
      if (error && error.code !== '23505') {
        console.error('[Success] Erro ao registrar acesso:', error.message);
      }
    } catch (err) {
      console.error('[Success] Falha ao registrar acesso:', err);
    }
  };

  if (loading) {
    return (
      <div className="success-loading">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  const pendente = statusTransacao === 'pendente';
  const concluido = statusTransacao === 'concluido';
  const falhou = ['falhou', 'estornado', 'contestado'].includes(statusTransacao);

  let Icone = CheckCircle;
  let iconeClasse = 'text-primary';
  let titulo = 'Acesso liberado!';
  let mensagem = 'A obra já está disponível para você. Você pode contribuir quando quiser.';

  if (requestId && pendente && !encerrado) {
    Icone = Clock; iconeClasse = 'text-accent';
    titulo = 'Aguardando a confirmação do pagamento';
    mensagem = 'Conclua o pagamento na aba do Mercado Pago. Seu acesso à obra já está liberado: use o botão abaixo quando quiser baixar.';
  } else if (requestId && pendente) {
    Icone = Clock; iconeClasse = 'text-accent';
    titulo = 'Ainda não recebemos a confirmação';
    mensagem = pagamentoIniciado === false
      ? 'Não encontramos um pagamento iniciado no Mercado Pago para esta contribuição. Se você fechou a aba antes de pagar, pode tentar de novo pela página da obra. Seu acesso continua liberado.'
      : 'Se você concluiu o pagamento, a confirmação aparece na sua biblioteca assim que o Mercado Pago avisar. Seu acesso à obra continua liberado.';
  } else if (falhou) {
    Icone = XCircle; iconeClasse = 'text-danger';
    titulo = statusTransacao === 'estornado' ? 'Contribuição estornada' : 'Pagamento não concluído';
    mensagem = 'Nenhum valor foi confirmado. Seu acesso à obra continua liberado; se quiser, tente contribuir de novo.';
  } else if (requestId && concluido) {
    titulo = 'Contribuição confirmada!';
    mensagem = valorPago > 0
      ? `Sua contribuição de R$ ${valorPago.toFixed(2)} foi confirmada. 90% vai para o artista. Obrigado por apoiar a cultura independente.`
      : 'Obrigado por apoiar a cultura e valorizar o trabalho dos artistas independentes.';
  }

  return (
    <div className="container py-12 success-page">
      <div className="success-card card">
        <Icone size={64} className={`${iconeClasse} success-icon`} />

        <h1 className="success-title">{titulo}</h1>
        <p className="text-muted success-message">{mensagem}</p>

        {requestId && pendente && (
          <div className="success-verificacao">
            {!encerrado && (
              <div className="success-polling">
                <Loader2 className="animate-spin" size={16} />
                <span>Verificando automaticamente…</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn-outline success-verificar-btn"
              onClick={verificar}
              disabled={verificando}
            >
              {verificando ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Já paguei, verificar agora
            </button>
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
              <p className="text-muted success-book-note">Acesso liberado à obra.</p>

              <div className="success-actions">
                {book.downloadUrl ? (
                  <a
                    href={book.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary success-action-btn"
                    onClick={registrarAcesso}
                  >
                    <Download size={18} /> Baixar obra
                  </a>
                ) : (
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
