import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Feather, BookOpen, Search, Sparkles, MapPin, HeartHandshake, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import OngsTicker from '../components/OngsTicker';
import { catalogoDoAutor } from '../lib/rotas';
import './Authors.css';

export default function Authors() {
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGenre, setActiveGenre] = useState('Todos');

  useEffect(() => {
    async function fetchAuthors() {
      try {
        setLoading(true);

        const { data: dbUsers, error: userError } = await supabase
          .from('usuarios')
          .select('id, nome, bio, avatar_url, is_autor, created_at')
          .eq('is_autor', true);

        if (userError) throw userError;

        const { data: dbObras, error: obrasError } = await supabase
          .from('obras')
          .select('id, titulo, autor_id');

        if (obrasError) throw obrasError;

        const authorsList = (dbUsers || []).map(dbUser => {
          const obrasDoAutor = (dbObras || []).filter(o => o.autor_id === dbUser.id);
          return {
            id: dbUser.id,
            nome: dbUser.nome,
            bio: dbUser.bio || 'Artista independente e autor cadastrado no Arte sem Preço.',
            avatar: dbUser.avatar_url || null,
            generos: dbUser.generos && dbUser.generos.length > 0 ? dbUser.generos : ['Literatura Independente'],
            obrasCount: obrasDoAutor.length,
            cidade: dbUser.cidade || 'Brasil',
            causaApoiada: dbUser.causa_apoiada || null,
            books: obrasDoAutor,
          };
        });

        setAuthors(authorsList);
      } catch (err) {
        console.error('Erro ao carregar autores:', err.message);
        setAuthors([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAuthors();
  }, []);

  const genresList = ['Todos', 'Poesia', 'Romance', 'Dramaturgia', 'Audiolivro', 'Ficção'];

  const filteredAuthors = authors.filter(author => {
    const matchesSearch = author.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      author.bio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (author.cidade && author.cidade.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesGenre = activeGenre === 'Todos' || (author.generos && author.generos.includes(activeGenre));
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="authors-page">
      <section className="authors-hero">
        <div className="container text-center">
          <div className="inline-flex items-center gap-2 badge badge-accent mb-4">
            <Feather size={14} />
            <span>Mentes & Vozes da Nossa Comunidade</span>
          </div>
          <h1 className="authors-hero-title text-serif">Nossos Autores & Artistas</h1>
          <p className="authors-hero-subtitle text-muted">
            Conheça as mentes independentes por trás das obras de nossa biblioteca aberta.
            Descubra quem cria, conheça suas histórias e acesse seus livros diretamente.
          </p>

          <div className="authors-filter-bar">
            <div className="search-bar">
              <Search className="search-icon text-muted" size={20} />
              <input
                type="text"
                placeholder="Buscar autor por nome, bio ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="genre-pills">
              {genresList.map(g => (
                <button
                  key={g}
                  className={`genre-pill ${activeGenre === g ? 'active' : ''}`}
                  onClick={() => setActiveGenre(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-body">
        <div className="container">
          {loading ? (
            <div className="flex justify-center items-center" style={{ minHeight: '40vh' }}>
              <Loader2 className="animate-spin text-primary" size={48} />
            </div>
          ) : (
            <div className="authors-grid">
              {filteredAuthors.map(author => (
                <div key={author.id} className="author-card">
                  <div className="author-card-header">
                    <div className="author-avatar-wrapper">
                      {author.avatar ? (
                        <img src={author.avatar} alt={author.nome} className="author-avatar" />
                      ) : (
                        <div className="author-avatar-fallback">
                          {author.nome.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="author-main-info">
                      <h3 className="author-name">{author.nome}</h3>
                      {author.cidade && (
                        <span className="author-location flex items-center gap-1">
                          <MapPin size={13} /> {author.cidade}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="author-card-body">
                    <p className="author-bio">{author.bio}</p>

                    <div className="author-tags flex flex-wrap gap-2 my-3">
                      {author.generos && author.generos.map((gen, idx) => (
                        <span key={idx} className="author-tag-pill">{gen}</span>
                      ))}
                    </div>

                    {author.causaApoiada && (
                      <div className="author-cause-badge flex items-center gap-2">
                        <HeartHandshake size={14} />
                        <span>Apoia: <strong>{author.causaApoiada}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="author-card-footer flex justify-between items-center">
                    <span className="obras-count flex items-center gap-1">
                      <BookOpen size={15} /> {author.obrasCount} {author.obrasCount === 1 ? 'Obra' : 'Obras'}
                    </span>

                    <Link
                      to={catalogoDoAutor(author.id, author.nome)}
                      className="btn btn-outline btn-sm flex items-center gap-1 author-btn-books"
                    >
                      <span>Ver Livros</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}

              {filteredAuthors.length === 0 && (
                <div className="empty-state text-center text-muted" style={{ gridColumn: '1 / -1', padding: '3rem 0' }}>
                  <p>Nenhum autor encontrado para os critérios selecionados.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="section bg-surface">
        <OngsTicker title="Causas & Projetos Apoiados por Nossos Autores" />
      </section>

      <section className="section author-cta-section">
        <div className="container">
          <div className="author-cta-card flex flex-col items-center text-center">
            <div className="author-cta-badge badge badge-accent mb-3">
              <Sparkles size={14} /> Junte-se a Nós
            </div>
            <h2 className="author-cta-title text-serif">Você escreve ou produz arte?</h2>
            <p className="author-cta-desc">
              Publicar no <strong>Arte sem Preço</strong> significa dar asas à sua obra com acesso universal,
              transparência total no split (90% para você) e conexão direta com leitores que valorizam a cultura.
            </p>
            <Link to="/cadastro" className="btn btn-primary flex items-center gap-2">
              <Feather size={18} />
              <span>Cadastrar-se como Artista</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}