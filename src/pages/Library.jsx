import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Book, CheckCircle2 } from 'lucide-react';
import { mockBooks } from '../data/mockData';
import './Library.css';

export default function Library() {
  // Mock saved books (simulating "Pague Depois" flux)
  const savedBooks = mockBooks.slice(0, 2);
  const paidBooks = [mockBooks[2]];

  return (
    <div className="library-page container py-8">
      <div className="library-header mb-8 text-center">
        <h1 className="text-serif mb-2">Minha Biblioteca</h1>
        <p className="text-muted">Acesse suas obras salvas e retribua aos artistas quando puder.</p>
      </div>

      <div className="library-section mb-12">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <Book className="text-primary" />
          Salvas para Pagar Depois
        </h2>
        <div className="library-grid">
          {savedBooks.map(book => (
            <div key={book.id} className="library-card card">
              <img src={book.coverUrl} alt={book.title} className="lib-cover" />
              <div className="lib-info flex flex-col p-4">
                <span className="text-xs text-muted uppercase">{book.category}</span>
                <h3 className="lib-title">{book.title}</h3>
                <p className="text-sm text-muted mb-4">{book.author}</p>
                
                <Link to={`/obra/${book.id}`} className="btn btn-primary mt-auto text-sm">
                  Contribuir Agora
                </Link>
                <button className="btn btn-outline text-sm mt-2">
                  Baixar Novamente
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="library-section">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <CheckCircle2 className="text-accent" />
          Apoiadas
        </h2>
        <div className="library-grid opacity-80">
          {paidBooks.map(book => (
            <div key={book.id} className="library-card card">
              <img src={book.coverUrl} alt={book.title} className="lib-cover" />
              <div className="lib-info flex flex-col p-4">
                <span className="text-xs text-muted uppercase">{book.category}</span>
                <h3 className="lib-title">{book.title}</h3>
                <p className="text-sm text-muted mb-4">{book.author}</p>
                
                <span className="badge badge-accent mt-auto self-start">Apoio Realizado</span>
                <button className="btn btn-outline text-sm mt-4">
                  Baixar Novamente
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
