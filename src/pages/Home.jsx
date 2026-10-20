import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, HeartHandshake, Sparkles, Loader2, Wand2 } from 'lucide-react';
import BookCard from '../components/BookCard';
import OngsTicker from '../components/OngsTicker';
import { mockBooks } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { CATEGORIAS_SELECT, nomesDasCategorias } from '../lib/categorias';
import './Home.css';
import erico from '../assets/erico.jpeg';

// Mesmo shape usado pelas outras telas (Catalog, BookDetails) ao ler `obras`.
function formatarObra(dbBook) {
  const categories = nomesDasCategorias(dbBook);
  return {
    id: dbBook.id,
    title: dbBook.titulo,
    author: dbBook.usuarios?.nome || 'Autor Desconhecido',
    category: categories[0] || 'Sem Categoria',
    categories,
    synopsis: dbBook.descricao,
    coverUrl: dbBook.capa_url || null,
    downloadUrl: dbBook.arquivo_url,
    suggestedPrice: Number(dbBook.preco || 0),
    tags: dbBook.tags || [],
    cause: dbBook.causas?.nome || null,
  };
}

export default function Home() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recommendedBooks, setRecommendedBooks] = useState([]);

  useEffect(() => {
    async function fetchBooks() {
      try {
        const { data, error } = await supabase
          .from('obras')
          .select(`
            id,
            titulo,
            descricao,
            preco,
            capa_url,
            arquivo_url,
            tags,
            causa_id,
            usuarios(nome),
            ${CATEGORIAS_SELECT},
            causas(nome)
          `);

        if (error) throw error;

        if (data && data.length > 0) {
          setBooks(data.map(formatarObra));
        } else {
          setBooks(mockBooks);
        }
      } catch (err) {
        console.error('Erro ao buscar obras:', err.message);
        setBooks(mockBooks);
      } finally {
        setLoading(false);
      }
    }

    fetchBooks();
  }, []);

  // Seção "Recomendado para Você": pontua obras pelo histórico de transacoes
  // do leitor (autor/causa/categoria/tags em comum). Sem histórico (leitor
  // novo ou deslogado), a função no banco já cai para as mais recentes.
  useEffect(() => {
    async function fetchRecomendacoes() {
      try {
        const { data: scored, error: scoreError } = await supabase
          .rpc('obter_recomendacoes', { p_limit: 6 });

        if (scoreError) throw scoreError;
        if (!scored || scored.length === 0) {
          setRecommendedBooks([]);
          return;
        }

        const ids = scored.map(r => r.obra_id);
        const { data, error } = await supabase
          .from('obras')
          .select(`
            id,
            titulo,
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
          .in('id', ids);

        if (error) throw error;

        const porId = new Map((data || []).map(dbBook => [dbBook.id, formatarObra(dbBook)]));
        setRecommendedBooks(ids.map(id => porId.get(id)).filter(Boolean));
      } catch (err) {
        console.error('[Home] Erro ao buscar recomendações:', err.message);
        setRecommendedBooks([]);
      }
    }

    fetchRecomendacoes();
  }, []);

  // Filtros de obras em destaque e de impacto social
  const featuredBooks = books.filter(book => book.tags?.includes('Destaque') || book.tags?.includes('Lançamento')).length > 0
    ? books.filter(book => book.tags?.includes('Destaque') || book.tags?.includes('Lançamento')).slice(0, 3)
    : books.slice(0, 3);

  const transformativeBooks = books.filter(book => book.tags?.includes('Arte que Transforma')).length > 0
    ? books.filter(book => book.tags?.includes('Arte que Transforma')).slice(0, 3)
    : books.filter(book => book.cause || book.causa_id).slice(0, 3);

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ minHeight: '60vh' }}>
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="container hero-container">
          <div className="hero-content animate-fade-in">
            <h1 className="hero-title">
              A arte tem valor.<br />
              <span className="text-primary">O preço, você decide.</span>
            </h1>
            <p className="hero-subtitle">
              Uma biblioteca digital aberta e colaborativa. Acesse literatura independente de qualidade sem barreiras, e contribua com o valor que achar justo para apoiar quem cria.
            </p>
            <div className="hero-actions flex gap-4">
              <Link to="/catalogo" className="btn btn-primary">
                Explorar Catálogo
              </Link>
              <Link to="/autores" className="btn btn-outline">
                Conhecer Autores
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Recommended Books Section */}
      {recommendedBooks.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header flex justify-between items-end mb-8">
              <div>
                <div className="inline-flex items-center gap-2 text-sm text-primary font-medium mb-1">
                  <Wand2 size={16} /> Para Você
                </div>
                <h2 className="section-title">Recomendado para Você</h2>
                <p className="text-muted">Com base nas obras que você curtiu, baixou e apoiou.</p>
              </div>
              <Link to="/catalogo" className="flex items-center gap-2 text-primary hover-underline">
                Ver todo o catálogo <ArrowRight size={18} />
              </Link>
            </div>

            <div className="books-grid">
              {recommendedBooks.map(book => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Books Section */}
      <section className="section bg-surface">
        <div className="container">
          <div className="section-header flex justify-between items-end mb-8">
            <div>
              <h2 className="section-title">Em Destaque</h2>
              <p className="text-muted">Obras literárias que você precisa conhecer hoje.</p>
            </div>
            <Link to="/catalogo" className="flex items-center gap-2 text-primary hover-underline">
              Ver todo o catálogo <ArrowRight size={18} />
            </Link>
          </div>

          <div className="books-grid">
            {featuredBooks.map(book => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </div>
      </section>

      {/* Arte que Transforma Section */}
      <section className="section section-accent">
        <div className="container">
          <div className="transforma-header text-center mb-12">
            <div className="inline-flex items-center justify-center badge badge-accent mb-4">
              <Sparkles size={14} className="mr-2" />
              Impacto Social
            </div>
            <h2 className="section-title text-accent">Arte que Transforma</h2>
            <p className="transforma-subtitle mx-auto">
              Obras onde o artista destina parte ou a totalidade dos rendimentos para causas e instituições beneficentes.
            </p>
          </div>

          <div className="books-grid mb-12">
            {transformativeBooks.map(book => (
              <div key={book.id} className="transforma-card-wrapper relative">
                <BookCard book={book} />
                {book.cause && (
                  <div className="cause-indicator flex items-center gap-2">
                    <HeartHandshake size={16} />
                    <span>Apoia: {book.cause}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Carrossel Contínuo das ONGs */}
        <OngsTicker title="Ações & ONGs no Arte que Transforma" />
      </section>

      {/* How it Works / Transparency Section */}
      <section className="section bg-surface">
        <div className="container">
          <div className="split-layout">
            <div className="split-content">
              <h2 className="section-title">Transparência Radical</h2>
              <p className="text-lg mb-6">
                Acreditamos que a relação entre leitor e autor deve ser direta e honesta. O acesso nunca é bloqueado por falta de pagamento.
              </p>

              <div className="split-stats flex flex-col gap-6">
                <div className="stat-item flex items-start gap-4">
                  <div className="stat-number text-primary">90%</div>
                  <div>
                    <h4 className="stat-title">Para o Artista</h4>
                    <p className="text-muted">Vão diretamente para quem criou a obra ou para a causa apoiada.</p>
                  </div>
                </div>
                <div className="stat-item flex items-start gap-4">
                  <div className="stat-number text-muted">10%</div>
                  <div>
                    <h4 className="stat-title">Para a Plataforma</h4>
                    <p className="text-muted">Ajudam a manter nossos servidores e a desenvolver novas ferramentas.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="split-image-container">
              <div className="split-visual">
                <div className="split-visual-artist">90% Artista</div>
                <div className="split-visual-platform">10% Plataforma</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Founder & Curator Section (Erico Santos) */}
      <section className="section section-curator">
        <div className="container">
          <div className="curator-card">
            {/* Bloco do Perfil e Foto */}
            <div className="curator-profile">
              {/* Substiua esta parte na seção do Curador */}
              <div className="curator-avatar-wrapper">
                <img
                  src={erico}
                  alt="Érico Santos"
                  className="curator-avatar"
                />
              </div>
              <h3 className="curator-name">Érico Santos</h3>
              <p className="curator-role">Curador & Idealizador</p>
            </div>

            {/* Bloco de Mensagem do Curador */}
            <div className="curator-content">
              <h2 className="section-title curator-title">
                Uma Perspectiva do Curador
              </h2>

              <p className="curator-subtitle">
                A arte tem valor. O acesso não precisa ter preço.
              </p>

              <div className="curator-text">
                <p>
                  Sempre me inquietou a ideia de que uma obra de arte pudesse encontrar seu limite no bolso de quem a deseja conhecer. Que um livro permanecesse fechado, uma poesia deixasse de ser lida ou uma canção não fosse escutada porque, entre a criação e o encontro, havia uma barreira econômica.
                </p>
                <p>
                  Não ignoro o valor do trabalho artístico. Ao contrário: acredito que a arte precisa ser valorizada, que artistas precisam viver daquilo que criam e que a cultura não pode continuar dependendo exclusivamente da disposição de quem cria para sobreviver à própria vocação. O que questiono é a ideia de que o acesso à arte precise estar, necessariamente, condicionado a um preço previamente estabelecido.
                </p>
                <p>
                  Foi dessa inquietação que nasceu o Arte sem Preço.
                </p>
                <p>
                  Não queremos uma arte sem valor. Queremos experimentar uma forma diferente de reconhecer esse valor.
                </p>
                <p>
                  Acreditamos que o encontro com uma obra pode anteceder a decisão de pagar por ela. Que alguém possa ler primeiro, sentir, pensar, emocionar-se, discordar, encontrar-se ou até perder-se naquilo que outro ser humano criou. E que, depois desse encontro, possa decidir quanto deseja ou pode contribuir.
                </p>
                <p>
                  É o princípio do <em>Pague Depois</em>: primeiro, o encontro; depois, a contribuição, quando possível e de acordo com a consciência e as condições de cada pessoa.
                </p>
                <p>
                  Essa inversão, embora simples, carrega uma escolha de mundo. Em vez de exigir que o público demonstre previamente sua capacidade de pagamento, oferecemos a possibilidade de que a própria experiência com a obra participe dessa decisão.
                </p>
                <p>
                  Não se trata de desmerecer o trabalho de quem cria, tampouco de romantizar as dificuldades enfrentadas pelos artistas. A vocação não paga as contas, a sensibilidade não compra o pão e o talento não deveria precisar escolher entre continuar criando e conseguir viver.
                </p>
                <p>
                  Por isso, o Arte sem Preço destina 90% de cada contribuição diretamente ao artista. Porque democratizar o acesso à cultura sem cuidar de quem a produz seria apenas resolver metade do problema.
                </p>
                <p>
                  Também acredito que a liberdade artística precisa vir acompanhada da liberdade de escolha de quem recebe a obra. A arte não deve ser reduzida à mercadoria, mas tampouco precisa ser condenada à invisibilidade para permanecer livre. Entre a obrigação de pagar antes de conhecer e a impossibilidade de remunerar quem cria, há caminhos que merecem ser experimentados.
                </p>
                <p>
                  O Arte sem Preço é um desses caminhos.
                </p>
                <p>
                  Não temos a pretensão de resolver, sozinhos, as contradições históricas entre arte, mercado e acesso à cultura. Preferimos começar com uma pergunta e transformá-la em prática: o que aconteceria se déssemos às pessoas a oportunidade de conhecer uma obra antes de decidir quanto podem oferecer por ela?
                </p>
                <p>
                  Talvez descubramos que há mais generosidade do que supomos. Talvez percebamos que o acesso abre portas para artistas que jamais chegariam a determinados públicos e para leitores que, por diferentes razões, raramente teriam acesso a determinadas obras. E talvez aprendamos que valor e preço, embora possam caminhar juntos, não são a mesma coisa.
                </p>
                <p>
                  Como curador deste projeto, não me interessa apenas reunir obras em uma plataforma. Interessa-me aproximar pessoas. Criar passagens onde antes havia barreiras. Fazer circular ideias, sensibilidades, histórias e maneiras de enxergar o mundo. Porque uma obra guardada em uma gaveta pode ter enorme valor, mas é no encontro com o outro que muitas vezes ela descobre novas possibilidades de existir.
                </p>
                <p>
                  No fundo, o Arte sem Preço também é um convite à confiança. Confiança em quem cria, em quem recebe e na possibilidade de construirmos relações menos condicionadas pela capacidade imediata de comprar.
                </p>
                <p>
                  A arte tem valor. O artista merece reconhecimento e remuneração. E ninguém deveria precisar provar que pode pagar para ter a oportunidade de se emocionar, aprender, imaginar ou pensar.
                </p>
                <p className="curator-highlight">
                  <strong>O preço pode esperar. O encontro, não precisa.</strong>
                </p>
                <p>
                  É por isso que fazemos o Arte sem Preço: para que a arte circule, os artistas sejam valorizados e mais pessoas possam descobrir aquilo que uma obra é capaz de despertar.
                </p>
              </div>

              {/* Assinatura e Link Interno */}
              <div className="curator-signature-block">
                <div className="curator-signature">
                  <span className="curator-signature-name">Érico Santos</span>
                  <span className="curator-signature-role">Curador e idealizador do Arte sem Preço</span>
                </div>
                <Link to="/manifesto" className="curator-link">
                  Leia o nosso manifesto &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}