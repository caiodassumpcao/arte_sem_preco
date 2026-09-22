import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';

export default function Dashboard() {
  // A rota /painel é protegida por ProtectedRoute requireAutor,
  // então aqui user e perfil já existem e is_autor é true.
  const { user, perfil } = useAuth();

  // --- ESTADOS DE DADOS ---
  const [obras, setObras] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [ganhosTotais, setGanhosTotais] = useState(0);

  // --- ESTADOS DE INTERFACE E CARREGAMENTO ---
  const [loadingObras, setLoadingObras] = useState(true);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [loadingGanhos, setLoadingGanhos] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  // null = publicando obra nova; com valor = editando essa obra existente.
  const [editingObra, setEditingObra] = useState(null);

  // --- ESTADO DO FORMULÁRIO ---
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    categoria_id: '',
    preco: '',
  });

  // Estados separados para os arquivos fisicos selecionados
  const [capaFile, setCapaFile] = useState(null);
  const [arquivoFile, setArquivoFile] = useState(null);

  // ---------------------------------------------------------------------------
  // 1. CARREGAMENTO INICIAL
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (user?.id) fetchObras(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (isModalOpen) {
      fetchCategorias();
    }
  }, [isModalOpen]);

  const fetchObras = async (autorId) => {
    if (!autorId) return;
    try {
      setLoadingObras(true);

      // FILTRO OBRIGATÓRIO: somente as obras do autor autenticado.
      const { data, error } = await supabase
        .from('obras')
        .select('*, categorias(nome)')
        .eq('autor_id', autorId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Dashboard] Erro ao buscar obras:', error.message);
        setObras([]);
        setGanhosTotais(0);
        setLoadingGanhos(false);
        return;
      }

      const lista = data || [];
      setObras(lista);
      fetchGanhos(lista.map((obra) => obra.id));
    } catch (err) {
      console.error('[Dashboard] Exceção em fetchObras:', err);
      setObras([]);
    } finally {
      setLoadingObras(false);
    }
  };

  const fetchCategorias = async () => {
    try {
      setLoadingCategorias(true);

      const { data, error } = await supabase
        .from('categorias')
        .select('id, nome, slug')
        .order('nome', { ascending: true });

      if (error) {
        console.error('[Dashboard] Erro ao buscar categorias:', error);
      } else {
        setCategorias(data || []);
      }
    } catch (err) {
      console.error('[Dashboard] Exceção em fetchCategorias:', err);
    } finally {
      setLoadingCategorias(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. CÁLCULO DE GANHOS TOTAIS
  // ---------------------------------------------------------------------------
  const fetchGanhos = async (obraIds) => {
    try {
      setLoadingGanhos(true);

      if (!obraIds || obraIds.length === 0) {
        setGanhosTotais(0);
        return;
      }

      // Somente transações concluídas das obras deste autor.
      // valor_autor é o líquido do split 90/10 gravado pelo webhook;
      // para registros antigos cai no fallback de 90% do valor_pago.
      const { data, error } = await supabase
        .from('transacoes')
        .select('valor_pago, valor_autor, obra_id, status')
        .in('obra_id', obraIds)
        .eq('status', 'concluido');

      if (error) {
        console.error('[Dashboard] Erro ao buscar ganhos:', error);
        setGanhosTotais(0);
        return;
      }

      const total = (data || []).reduce((sum, t) => {
        const liquido = t.valor_autor != null
          ? Number(t.valor_autor)
          : Number(t.valor_pago || 0) * 0.9;
        return sum + liquido;
      }, 0);
      setGanhosTotais(total);
    } catch (err) {
      console.error('[Dashboard] Exceção em fetchGanhos:', err);
      setGanhosTotais(0);
    } finally {
      setLoadingGanhos(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. FUNÇÃO DE UPLOAD PARA O SUPABASE STORAGE
  // ---------------------------------------------------------------------------
  const uploadFileToStorage = async (file, folderPath) => {
    if (!file) return null;

    // Sanitiza o nome do arquivo e adiciona timestamp para evitar colisões
    const fileExt = file.name.split('.').pop();
    const cleanFileName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .toLowerCase();
    const filePath = `${folderPath}/${Date.now()}_${cleanFileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('obras')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error(`[Dashboard Storage] Erro no upload (${folderPath}):`, uploadError);
      throw new Error(`Falha no upload do arquivo (${folderPath}): ${uploadError.message}`);
    }

    // Obtém a URL pública do arquivo enviado
    const { data: publicUrlData } = supabase.storage
      .from('obras')
      .getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  // ---------------------------------------------------------------------------
  // 4. MANIPULAÇÃO DO FORMULÁRIO E SUBMISSÃO
  // ---------------------------------------------------------------------------
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenModal = () => {
    setEditingObra(null);
    setFormData({ titulo: '', descricao: '', categoria_id: '', preco: '' });
    setCapaFile(null);
    setArquivoFile(null);
    setFeedbackMsg(null);
    setUploadProgress('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (obra) => {
    setEditingObra(obra);
    setFormData({
      titulo: obra.titulo || '',
      descricao: obra.descricao || '',
      categoria_id: obra.categoria_id || '',
      preco: obra.preco != null ? String(obra.preco) : '',
    });
    setCapaFile(null);
    setArquivoFile(null);
    setFeedbackMsg(null);
    setUploadProgress('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingObra(null);
    setFormData({
      titulo: '',
      descricao: '',
      categoria_id: '',
      preco: '',
    });
    setCapaFile(null);
    setArquivoFile(null);
    setUploadProgress('');
  };


  const handleSubmitObra = async (e) => {
    e.preventDefault();

    // 1. Garante a captura da sessão/usuário atual do Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setFeedbackMsg({ type: 'error', text: 'Sessão inválida ou não autenticada. Faça login novamente.' });
      return;
    }

    const currentUser = session.user;

    if (!formData.categoria_id) {
      alert('Por favor, selecione uma categoria.');
      return;
    }

    try {
      setSubmitting(true);
      setFeedbackMsg(null);

      // Na edição, só sobe arquivo novo se o autor trocou; senão mantém a URL
      // que já estava salva (capa/arquivo continuam obrigatórios só na criação).
      let capaUrl = editingObra?.capa_url ?? null;
      let arquivoUrl = editingObra?.arquivo_url ?? null;

      if (capaFile) {
        setUploadProgress('Enviando capa...');
        capaUrl = await uploadFileToStorage(capaFile, 'capas');
      }

      if (arquivoFile) {
        setUploadProgress('Enviando arquivo principal...');
        arquivoUrl = await uploadFileToStorage(arquivoFile, 'arquivos');
      }

      setUploadProgress('Salvando registro da obra...');

      const payload = {
        titulo: formData.titulo,
        descricao: formData.descricao,
        categoria_id: formData.categoria_id,
        preco: formData.preco ? parseFloat(formData.preco) : 0,
        capa_url: capaUrl,
        arquivo_url: arquivoUrl
      };

      const { error } = editingObra
        ? await supabase
            .from('obras')
            .update(payload)
            // RLS já restringe a autor_id = auth.uid(); o filtro aqui é
            // só pra buscar a linha certa.
            .eq('id', editingObra.id)
        : await supabase
            .from('obras')
            .insert([{ ...payload, autor_id: currentUser.id }]);

      if (error) {
        console.error('[Dashboard] Erro ao salvar obra:', error);
        setFeedbackMsg({ type: 'error', text: `Erro no banco: ${error.message}` });
      } else {
        setFeedbackMsg({
          type: 'success',
          text: editingObra ? 'Obra atualizada com sucesso!' : 'Obra e arquivos publicados com sucesso!',
        });
        fetchObras(currentUser.id);
        setTimeout(() => {
          handleCloseModal();
        }, 1200);
      }
    } catch (err) {
      console.error('[Dashboard] Erro na submissão:', err);
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro inesperado ao publicar.' });
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  // ---------------------------------------------------------------------------
  // 5. RENDERIZAÇÃO
  // ---------------------------------------------------------------------------
  return (
    <div className="dashboard-page">
      <div className="container">

        {/* CABEÇALHO */}
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Painel do Autor</h1>
            <p className="dashboard-subtitle">
              {perfil?.nome ? `${perfil.nome} — ` : ''}gerencie suas obras e acompanhe suas publicações.
            </p>
          </div>
          <button type="button" onClick={handleOpenModal} className="dashboard-cta">
            + Publicar Nova Obra
          </button>
        </div>

        {/* MÉTRICAS */}
        <div className="metrics-grid" style={{ marginBottom: '2.5rem' }}>
          <div className="metric-card" style={{ padding: '1.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>Total de Obras</span>
            <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem' }}>
              {obras.length}
            </div>
          </div>
          <div className="metric-card" style={{ padding: '1.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>Categorias Ativas</span>
            <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem' }}>
              {categorias.length}
            </div>
          </div>
          <div className="metric-card" style={{ padding: '1.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>Ganhos Totais</span>
            <div
              className="metric-value"
              style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#4ade80' }}
            >
              {loadingGanhos ? '...' : `R$ ${ganhosTotais.toFixed(2)}`}
            </div>
          </div>
        </div>

        {/* TABELA DE OBRAS */}
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Suas Obras</h2>

          {loadingObras ? (
            <p style={{ color: '#a1a1aa' }}>Carregando obras...</p>
          ) : obras.length === 0 ? (
            <p style={{ color: '#71717a' }}>Nenhuma obra cadastrada ainda.</p>
          ) : (
            <div className="table-responsive">
              <table className="works-table">
                <thead>
                  <tr>
                    <th>Capa</th>
                    <th>Título</th>
                    <th>Categoria</th>
                    <th>Preço</th>
                    <th>Data</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {obras.map((obra) => (
                    <tr key={obra.id}>
                      <td>
                        {obra.capa_url ? (
                          <img
                            src={obra.capa_url}
                            alt={obra.titulo}
                            style={{ width: '40px', height: '56px', objectFit: 'cover', borderRadius: '4px' }}
                          />
                        ) : (
                          <div style={{ width: '40px', height: '56px', backgroundColor: '#27272a', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#71717a' }}>Sem capa</div>
                        )}
                      </td>
                      <td style={{ fontWeight: '500' }}>{obra.titulo}</td>
                      <td>
                        <span className="badge badge-accent">
                          {obra.categorias?.nome || 'Sem Categoria'}
                        </span>
                      </td>
                      <td>{obra.preco ? `R$ ${parseFloat(obra.preco).toFixed(2)}` : 'Grátis'}</td>
                      <td>{new Date(obra.created_at).toLocaleDateString('pt-BR')}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(obra)}
                          style={{
                            padding: '0.4rem 0.9rem',
                            borderRadius: '6px',
                            border: '1px solid #3f3f46',
                            backgroundColor: 'transparent',
                            color: '#d4d4d8',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL DE PUBLICAÇÃO DE OBRA */}
        {isModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
                  {editingObra ? `Editar "${editingObra.titulo}"` : 'Publicar Nova Obra'}
                </h3>
                <button
                  onClick={handleCloseModal}
                  style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>

              {feedbackMsg && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  backgroundColor: feedbackMsg.type === 'error' ? 'rgba(220, 38, 38, 0.2)' : 'rgba(22, 163, 74, 0.2)',
                  color: feedbackMsg.type === 'error' ? '#ef4444' : '#4ade80',
                  border: `1px solid ${feedbackMsg.type === 'error' ? '#ef4444' : '#4ade80'}`
                }}>
                  {feedbackMsg.text}
                </div>
              )}

              <form onSubmit={handleSubmitObra}>

                {/* Título */}
                <div className="form-group">
                  <label className="form-label" htmlFor="titulo">Título da Obra *</label>
                  <input
                    type="text"
                    id="titulo"
                    name="titulo"
                    className="form-input"
                    placeholder="Ex: O Dragão de Fogo"
                    value={formData.titulo}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {/* Linha dupla: Categoria e Preço */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="categoria_id">Categoria *</label>
                    <select
                      id="categoria_id"
                      name="categoria_id"
                      className="form-select"
                      value={formData.categoria_id}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">
                        {loadingCategorias
                          ? 'Carregando...'
                          : categorias.length === 0
                            ? 'Nenhuma categoria'
                            : 'Selecione a categoria'}
                      </option>
                      {categorias.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="preco">Preço (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="preco"
                      name="preco"
                      className="form-input"
                      placeholder="0.00"
                      value={formData.preco}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {/* Descrição */}
                <div className="form-group">
                  <label className="form-label" htmlFor="descricao">Sinopse / Descrição</label>
                  <textarea
                    id="descricao"
                    name="descricao"
                    className="form-textarea"
                    placeholder="Resumo ou apresentação da obra..."
                    value={formData.descricao}
                    onChange={handleInputChange}
                  />
                </div>

                {/* Upload da Capa (Imagem) */}
                <div className="form-group">
                  <label className="form-label" htmlFor="capaFile">
                    Imagem de Capa (JPG, PNG, WebP){editingObra ? ' — deixe em branco para manter a atual' : ''}
                  </label>
                  <input
                    type="file"
                    id="capaFile"
                    accept="image/*"
                    className="form-file"
                    onChange={(e) => setCapaFile(e.target.files[0] || null)}
                  />
                </div>

                {/* Upload do Arquivo / Vídeo / Livro */}
                <div className="form-group">
                  <label className="form-label" htmlFor="arquivoFile">
                    Arquivo do Livro / Vídeo / Mídia (PDF, EPUB, MP4, etc.){editingObra ? ' — deixe em branco para manter o atual' : ''}
                  </label>
                  <input
                    type="file"
                    id="arquivoFile"
                    accept=".pdf,.epub,.mobi,.mp4,.webm,.zip"
                    className="form-file"
                    onChange={(e) => setArquivoFile(e.target.files[0] || null)}
                  />
                </div>

                {/* Status de Upload */}
                {uploadProgress && (
                  <p style={{ color: '#ea580c', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    ⏳ {uploadProgress}
                  </p>
                )}

                {/* Botões do Modal */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={submitting}
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: '8px',
                      border: '1px solid #3f3f46',
                      backgroundColor: 'transparent',
                      color: '#d4d4d8',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#ea580c',
                      color: '#ffffff',
                      fontWeight: '600',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1
                    }}
                  >
                    {submitting
                      ? (editingObra ? 'Salvando...' : 'Enviando...')
                      : (editingObra ? 'Salvar Alterações' : 'Publicar Obra')}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}