import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Upload, DollarSign, Users, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [metrics, setMetrics] = useState({ totalReaders: 0, totalRevenue: 0 });
  const [works, setWorks] = useState([]);
  const [categories, setCategories] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [formData, setFormData] = useState({
    title: '', synopsis: '', categoryId: '', suggestedPrice: 0
  });
  const [coverFile, setCoverFile] = useState(null);
  const [bookFile, setBookFile] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }
      setUser(session.user);

      // Load Categories
      const { data: cats } = await supabase.from('categorias').select('id, nome');
      if (cats) setCategories(cats);

      // Load Works
      const { data: myWorks, error: worksError } = await supabase
        .from('obras')
        .select(`
          id, titulo, preco_sugerido,
          transacoes ( valor_pago, status )
        `)
        .eq('autor_id', session.user.id);
        
      if (!worksError && myWorks) {
        let totalRev = 0;
        let totalRead = 0;
        
        const formattedWorks = myWorks.map(w => {
          const validTx = w.transacoes.filter(t => t.status === 'concluido');
          const downloads = validTx.length;
          const revenue = validTx.reduce((acc, t) => acc + Number(t.valor_pago), 0);
          
          totalRead += downloads;
          totalRev += revenue;

          return {
            id: w.id,
            title: w.titulo,
            suggestedPrice: w.preco_sugerido,
            downloads,
            revenue
          };
        });

        setWorks(formattedWorks);
        setMetrics({ totalReaders: totalRead, totalRevenue: totalRev });
      }
      
      setLoading(false);
    }
    
    loadDashboard();
  }, [navigate]);

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.synopsis || !coverFile || !bookFile) {
      alert("Preencha todos os campos obrigatórios e envie os arquivos.");
      return;
    }

    setIsPublishing(true);
    
    try {
      // 1. Upload Cover
      const coverExt = coverFile.name.split('.').pop();
      const coverPath = `${user.id}/${Date.now()}_cover.${coverExt}`;
      const { data: coverData, error: coverError } = await supabase.storage
        .from('covers')
        .upload(coverPath, coverFile);
      if (coverError) throw coverError;
      
      const coverUrl = supabase.storage.from('covers').getPublicUrl(coverPath).data.publicUrl;

      // 2. Upload Book
      const bookExt = bookFile.name.split('.').pop();
      const bookPath = `${user.id}/${Date.now()}_book.${bookExt}`;
      const { data: bookData, error: bookError } = await supabase.storage
        .from('books')
        .upload(bookPath, bookFile);
      if (bookError) throw bookError;
      
      const bookUrl = supabase.storage.from('books').getPublicUrl(bookPath).data.publicUrl;

      // 3. Insert into Obras
      const { error: insertError } = await supabase.from('obras').insert({
        autor_id: user.id,
        titulo: formData.title,
        sinopse: formData.synopsis,
        categoria_id: formData.categoryId || null,
        preco_sugerido: formData.suggestedPrice,
        url_capa: coverUrl,
        url_arquivo: bookUrl
      });

      if (insertError) throw insertError;

      alert("Obra publicada com sucesso!");
      setShowModal(false);
      window.location.reload(); // Recarrega a página para atualizar os dados
    } catch (err) {
      console.error("Erro ao publicar:", err);
      alert("Erro ao publicar a obra. Verifique se os buckets (covers e books) estão criados no Supabase.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="dashboard-page bg-surface">
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
          <div>
            <h1 className="text-serif text-3xl mb-2">Painel do Artista</h1>
            <p className="text-muted">Bem-vindo, acompanhe o impacto de suas obras.</p>
          </div>
          <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowModal(true)}>
            <Upload size={18} /> Publicar Obra
          </button>
        </div>

        {/* Metrics */}
        <div className="metrics-grid mb-8">
          <div className="metric-card card p-6">
            <div className="flex items-center gap-3 mb-4 text-muted">
              <Users size={20} />
              <span className="font-medium uppercase text-sm">Leitores (Total)</span>
            </div>
            <div className="metric-value text-3xl font-bold text-serif">{metrics.totalReaders}</div>
            <div className="text-xs text-primary mt-2">Pessoas que acessaram suas obras</div>
          </div>
          <div className="metric-card card p-6">
            <div className="flex items-center gap-3 mb-4 text-muted">
              <DollarSign size={20} />
              <span className="font-medium uppercase text-sm">Contribuições (R$)</span>
            </div>
            <div className="metric-value text-3xl font-bold text-serif text-primary">
              R$ {(metrics.totalRevenue * 0.9).toFixed(2)}
            </div>
            <div className="text-xs text-muted mt-2">Valor líquido (split 90%) - Bruto: R$ {metrics.totalRevenue.toFixed(2)}</div>
          </div>
          <div className="metric-card card p-6">
            <div className="flex items-center gap-3 mb-4 text-muted">
              <BarChart3 size={20} />
              <span className="font-medium uppercase text-sm">Desempenho</span>
            </div>
            <div className="metric-value text-3xl font-bold text-serif">
               {metrics.totalReaders > 0 ? ((works.filter(w => w.revenue > 0).length / works.length) * 100).toFixed(0) : 0}%
            </div>
            <div className="text-xs text-muted mt-2">Obras com conversão</div>
          </div>
        </div>

        {/* Works List */}
        <div className="card p-6">
          <h2 className="text-xl font-bold mb-6">Minhas Obras</h2>
          <div className="table-responsive">
            <table className="works-table">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Downloads</th>
                  <th>Receita Bruta</th>
                  <th>Valor Sugerido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {works.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-4 text-muted">Você ainda não possui obras publicadas.</td>
                  </tr>
                ) : (
                  works.map(w => (
                    <tr key={w.id}>
                      <td className="font-medium">{w.title}</td>
                      <td>{w.downloads}</td>
                      <td>R$ {w.revenue.toFixed(2)}</td>
                      <td>R$ {Number(w.suggestedPrice).toFixed(2)}</td>
                      <td><span className="badge badge-accent">Publicado</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Publish Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: '600px', width: '100%' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Publicar Nova Obra</h2>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-black"><X size={24} /></button>
            </div>
            
            <form onSubmit={handlePublish} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título da Obra *</label>
                <input 
                  type="text" 
                  className="w-full border rounded p-2" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})} 
                  required 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Sinopse *</label>
                <textarea 
                  className="w-full border rounded p-2 h-24" 
                  value={formData.synopsis} 
                  onChange={e => setFormData({...formData, synopsis: e.target.value})} 
                  required 
                ></textarea>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Categoria</label>
                  <select 
                    className="w-full border rounded p-2" 
                    value={formData.categoryId} 
                    onChange={e => setFormData({...formData, categoryId: e.target.value})}
                  >
                    <option value="">Selecione...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Valor Sugerido (R$)</label>
                  <input 
                    type="number" 
                    min="0" step="0.5" 
                    className="w-full border rounded p-2" 
                    value={formData.suggestedPrice} 
                    onChange={e => setFormData({...formData, suggestedPrice: e.target.value})} 
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Capa da Obra (Imagem) *</label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="w-full text-sm" 
                    onChange={e => setCoverFile(e.target.files[0])} 
                    required 
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Arquivo da Obra (PDF/EPUB) *</label>
                  <input 
                    type="file" 
                    accept=".pdf,.epub" 
                    className="w-full text-sm" 
                    onChange={e => setBookFile(e.target.files[0])} 
                    required 
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary w-full mt-4 py-3 flex justify-center items-center gap-2"
                disabled={isPublishing}
              >
                {isPublishing ? <><Loader2 size={18} className="animate-spin" /> Publicando...</> : 'Publicar Obra'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
