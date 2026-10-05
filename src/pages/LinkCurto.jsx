import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { catalogoDoAutor } from '../lib/rotas';

// /o/:codigo — link curto impresso no colofão dos arquivos das obras.
// Esses arquivos circulam por anos fora da plataforma, então o link precisa
// sempre levar a algum lugar útil: a obra; se ela saiu do ar, as obras do
// autor; em último caso, o catálogo.
export default function LinkCurto() {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function resolver() {
      const { data, error } = await supabase
        .from('links_obra')
        .select('obra_id, autor_id, usuarios(nome)')
        .eq('codigo', (codigo || '').toLowerCase())
        .maybeSingle();

      if (!ativo) return;
      if (error) console.error('[LinkCurto] Erro ao resolver link:', error.message);

      if (data?.obra_id) {
        navigate(`/obra/${data.obra_id}`, { replace: true });
      } else if (data?.autor_id) {
        navigate(catalogoDoAutor(data.autor_id, data.usuarios?.nome), { replace: true });
      } else {
        setNaoEncontrado(true);
      }
    }

    resolver();
    return () => { ativo = false; };
  }, [codigo, navigate]);

  if (naoEncontrado) {
    return (
      <div className="container py-20 text-center">
        <h1 className="mb-4">Obra não encontrada</h1>
        <p className="text-muted mb-6">
          Este link não corresponde a nenhuma obra. Ela pode ter saído do ar, mas o catálogo tem
          muitas outras de artistas independentes.
        </p>
        <Link to="/catalogo" className="btn btn-primary">Explorar o catálogo</Link>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center" style={{ minHeight: '60vh' }}>
      <Loader2 className="animate-spin text-primary" size={48} />
    </div>
  );
}
