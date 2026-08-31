import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Download, BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getBookById } from '../data/mockData';

export default function Success() {
  const [searchParams] = useSearchParams();
  const obraId = searchParams.get('obra_id');
  const status = searchParams.get('status'); // pode ser 'pending', 'approved', etc.
  
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBook() {
      if (!obraId) {
        setLoading(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('obras')
          .select('titulo, url_capa, url_arquivo')
          .eq('id', obraId)
          .maybeSingle();
          
        if (data) {
          setBook({
            title: data.titulo,
            coverUrl: data.url_capa || '/src/assets/placeholder.png',
            downloadUrl: data.url_arquivo
          });
          return;
        }

        // Fallback mock
        const mock = getBookById(obraId);
        if (mock) {
          setBook({
            title: mock.title,
            coverUrl: mock.coverUrl,
            downloadUrl: mock.downloadUrl || null
          });
        }
      } catch (err) {
        console.error('Erro ao carregar obra', err);
        const mock = getBookById(obraId);
        if (mock) {
          setBook({
            title: mock.title,
            coverUrl: mock.coverUrl,
            downloadUrl: mock.downloadUrl || null
          });
        }
      } finally {
        setLoading(false);
      }
    }
    
    fetchBook();
  }, [obraId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ minHeight: '60vh' }}>
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  const isPending = status === 'pending';

  return (
    <div className="container py-12" style={{ minHeight: '60vh' }}>
      <div className="max-w-xl mx-auto card text-center p-8">
        <CheckCircle size={64} className="text-primary mx-auto mb-6" />
        
        <h1 className="text-3xl font-bold mb-2">
          {isPending ? 'Contribuição em processamento!' : 'Contribuição confirmada!'}
        </h1>
        
        <p className="text-muted mb-8">
          {isPending 
            ? 'Sua contribuição está sendo processada pelo Mercado Pago e será confirmada em breve.'
            : 'Obrigado por apoiar a cultura e valorizar o trabalho dos artistas independentes.'}
        </p>

        {book && (
          <div className="bg-surface p-6 rounded-lg mb-8 flex flex-col md:flex-row items-center gap-6 text-left">
            <img 
              src={book.coverUrl} 
              alt={book.title} 
              className="w-24 h-36 object-cover rounded shadow-md"
            />
            <div>
              <h3 className="font-bold text-xl mb-2">{book.title}</h3>
              <p className="text-sm text-muted mb-4">Acesso liberado à obra.</p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                {book.downloadUrl ? (
                  <a href={book.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary flex gap-2 items-center justify-center">
                    <Download size={18} /> Baixar Arquivo
                  </a>
                ) : (
                  <button className="btn btn-primary flex gap-2 items-center justify-center" onClick={() => alert('Download simulado concluído!')}>
                    <Download size={18} /> Baixar Arquivo
                  </button>
                )}
                <Link to="/minha-biblioteca" className="btn btn-outline flex gap-2 items-center justify-center">
                  <BookOpen size={18} /> Minha Biblioteca
                </Link>
              </div>
            </div>
          </div>
        )}

        {!book && (
          <div className="mb-8">
            <p className="text-red-500">Não foi possível carregar os detalhes da obra (ID inválido).</p>
          </div>
        )}

        <Link to="/catalogo" className="text-primary hover:underline font-medium">
          Voltar ao Catálogo
        </Link>
      </div>
    </div>
  );
}
