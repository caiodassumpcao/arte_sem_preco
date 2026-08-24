import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, Download, BookOpen, User, Info, Check } from 'lucide-react';
import { getBookById } from '../data/mockData';
import './BookDetails.css';

export default function BookDetails() {
  const { id } = useParams();
  const book = getBookById(id);
  const [contribution, setContribution] = useState(book?.suggestedPrice || 0);
  const [showModal, setShowModal] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!book) {
    return (
      <div className="container py-8 text-center">
        <h2>Obra não encontrada</h2>
        <Link to="/catalogo" className="btn btn-primary mt-4">Voltar ao Catálogo</Link>
      </div>
    );
  }

  const artistSplit = (contribution * 0.9).toFixed(2);
  const platformSplit = (contribution * 0.1).toFixed(2);

  return (
    <div className="book-details-page">
      <div className="container py-8">
        <div className="book-layout">
          {/* Left Column: Cover */}
          <div className="book-cover-col">
            <div className="detail-cover-container">
              <img src={book.coverUrl} alt={`Capa de ${book.title}`} className="detail-cover" />
            </div>
            <div className="book-meta-list flex flex-col gap-4 mt-6">
              <div className="meta-item flex gap-2">
                <BookOpen size={18} className="text-muted" />
                <span className="text-muted">Categoria:</span> 
                <strong>{book.category}</strong>
              </div>
              <div className="meta-item flex gap-2">
                <User size={18} className="text-muted" />
                <span className="text-muted">Autor:</span> 
                <strong>{book.author}</strong>
              </div>
              {book.cause && (
                <div className="meta-item flex gap-2">
                  <Heart size={18} className="text-accent" />
                  <span className="text-accent font-medium">Apoia: {book.cause}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column: Info & Actions */}
          <div className="book-info-col">
            <div className="flex gap-2 mb-4">
              {book.tags?.map(tag => (
                <span key={tag} className={tag === 'Arte que Transforma' ? 'badge badge-accent' : 'badge badge-category'}>
                  {tag}
                </span>
              ))}
            </div>
            
            <h1 className="detail-title text-serif">{book.title}</h1>
            <p className="detail-author text-muted text-lg mb-6">por {book.author}</p>
            
            <div className="detail-synopsis mb-8">
              <h3 className="mb-4">Sinopse</h3>
              <p>{book.synopsis}</p>
            </div>
            
            <div className="contribution-widget card mb-8">
              <div className="widget-header bg-secondary p-4">
                <h3 className="flex items-center gap-2">
                  Acesso Aberto
                </h3>
                <p className="text-sm mt-1">A arte tem valor. O preço, você decide.</p>
              </div>
              
              <div className="widget-body p-6">
                <div className="contribution-input-group mb-6">
                  <label className="text-sm font-medium mb-2 block">Contribuição Voluntária (R$)</label>
                  <div className="flex items-center gap-4">
                    <button className="preset-btn" onClick={() => setContribution(0)}>R$ 0</button>
                    <button className="preset-btn" onClick={() => setContribution(book.suggestedPrice / 2)}>R$ {(book.suggestedPrice / 2).toFixed(2)}</button>
                    <button className="preset-btn active" onClick={() => setContribution(book.suggestedPrice)}>R$ {book.suggestedPrice.toFixed(2)}</button>
                    <div className="custom-input-wrapper flex-1">
                      <span className="currency-symbol">R$</span>
                      <input 
                        type="number" 
                        min="0"
                        step="0.5"
                        value={contribution}
                        onChange={(e) => setContribution(Number(e.target.value))}
                        className="custom-input"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="split-preview flex justify-between bg-surface border rounded p-4 mb-6">
                  <div className="split-item">
                    <span className="block text-sm text-muted mb-1">Para o artista</span>
                    <strong className="text-primary text-lg">R$ {artistSplit}</strong>
                    <span className="block text-xs text-muted">(90%)</span>
                  </div>
                  <div className="split-item text-right">
                    <span className="block text-sm text-muted mb-1">Para a plataforma</span>
                    <strong className="text-lg">R$ {platformSplit}</strong>
                    <span className="block text-xs text-muted">(10%)</span>
                  </div>
                </div>
                
                <div className="action-buttons flex gap-4">
                  {contribution > 0 ? (
                    <button className="btn btn-primary flex-1 py-3 text-lg" onClick={() => setShowModal(true)}>
                      Contribuir e Baixar
                    </button>
                  ) : (
                    <button className="btn btn-primary flex-1 py-3 text-lg">
                      Baixar Diretamente
                    </button>
                  )}
                  <button 
                    className={`btn ${saved ? 'btn-outline' : 'btn-outline'}`}
                    onClick={() => setSaved(!saved)}
                    title={saved ? "Salvo na Biblioteca" : "Salvar para Pagar Depois"}
                  >
                    {saved ? <Check size={24} className="text-primary" /> : <Heart size={24} />}
                  </button>
                </div>
                <p className="text-xs text-center text-muted mt-4 flex items-center justify-center gap-1">
                  <Info size={12} /> Salve na biblioteca para contribuir em outro momento.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Payment Modal (Mock) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h2 className="mb-4">Escolha a forma de contribuição</h2>
            <p className="mb-6 text-muted">Você está contribuindo com <strong>R$ {contribution.toFixed(2)}</strong> para "{book.title}".</p>
            
            <div className="flex flex-col gap-4">
              <button className="btn btn-outline justify-between py-4" onClick={() => {alert("Pix gerado!"); setShowModal(false)}}>
                <span>Pix</span>
                <span className="badge">Recomendado</span>
              </button>
              <button className="btn btn-outline justify-between py-4" onClick={() => {alert("Redirecionando para cartão..."); setShowModal(false)}}>
                <span>Cartão de Crédito</span>
              </button>
            </div>
            
            <button className="btn btn-block mt-6" onClick={() => setShowModal(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
