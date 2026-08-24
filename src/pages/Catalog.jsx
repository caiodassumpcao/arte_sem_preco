import { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import BookCard from '../components/BookCard';
import { mockBooks } from '../data/mockData';
import './Catalog.css';

export default function Catalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  
  const categories = ['Todos', 'Poesia', 'Romance', 'Dramaturgia', 'Audiolivro'];

  const filteredBooks = mockBooks.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          book.author.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'Todos' || book.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="catalog-page">
      <div className="catalog-header">
        <div className="container">
          <h1 className="catalog-title text-serif">Catálogo</h1>
          <p className="catalog-subtitle text-muted">Explore obras de artistas independentes e apoie a cultura livre.</p>
          
          <div className="catalog-filters">
            <div className="search-bar">
              <Search className="search-icon text-muted" size={20} />
              <input 
                type="text" 
                placeholder="Buscar por título ou autor..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="category-filters">
              {categories.map(cat => (
                <button 
                  key={cat}
                  className={`filter-btn ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="container py-8">
        <div className="books-grid">
          {filteredBooks.map(book => (
            <BookCard key={book.id} book={book} />
          ))}
          {filteredBooks.length === 0 && (
            <div className="empty-state text-center text-muted">
              <p>Nenhuma obra encontrada para esta busca.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
