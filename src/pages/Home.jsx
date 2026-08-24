import { Link } from 'react-router-dom';
import { ArrowRight, HeartHandshake, Sparkles } from 'lucide-react';
import BookCard from '../components/BookCard';
import { mockBooks } from '../data/mockData';
import './Home.css';

export default function Home() {
  const featuredBooks = mockBooks.filter(book => book.tags.includes('Destaque') || book.tags.includes('Lançamento')).slice(0, 3);
  const transformativeBooks = mockBooks.filter(book => book.tags.includes('Arte que Transforma')).slice(0, 3);

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
              <Link to="/manifesto" className="btn btn-outline">
                Nosso Manifesto
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Books */}
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

      {/* Arte que Transforma */}
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
          
          <div className="books-grid">
            {transformativeBooks.map(book => (
              <div key={book.id} className="transforma-card-wrapper relative">
                <BookCard book={book} />
                <div className="cause-indicator flex items-center gap-2">
                  <HeartHandshake size={16} />
                  <span>Apoia: {book.cause}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* How it Works / Transparency */}
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
               {/* Visual representation of the split could go here. For now, a styled div */}
               <div className="split-visual">
                 <div className="split-visual-artist">90% Artista</div>
                 <div className="split-visual-platform">10% Plataforma</div>
               </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
