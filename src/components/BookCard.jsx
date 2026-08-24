import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import './BookCard.css';

export default function BookCard({ book }) {
  return (
    <div className="card book-card animate-fade-in">
      <Link to={`/obra/${book.id}`} className="book-cover-link">
        <div className="book-cover-container">
          <img src={book.coverUrl} alt={`Capa do livro ${book.title}`} className="book-cover" />
          {book.tags && book.tags.length > 0 && (
            <div className="book-tags flex flex-col gap-2">
              {book.tags.map(tag => (
                <span key={tag} className={tag === 'Arte que Transforma' ? 'badge badge-accent' : 'badge badge-category'}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      
      <div className="book-info flex flex-col flex-1 justify-between">
        <div>
          <span className="book-category text-muted">{book.category}</span>
          <Link to={`/obra/${book.id}`}>
            <h3 className="book-title">{book.title}</h3>
          </Link>
          <p className="book-author text-muted">{book.author}</p>
        </div>
        
        <div className="book-actions flex justify-between items-center">
          <div className="suggested-price">
            <span className="text-muted text-sm">Valor sugerido</span>
            <div className="price-value">R$ {book.suggestedPrice.toFixed(2)}</div>
          </div>
          <button className="favorite-btn" aria-label="Salvar na biblioteca">
            <Heart size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
