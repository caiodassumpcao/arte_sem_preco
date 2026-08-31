import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Loader2, User, X } from 'lucide-react';
import BookCard from '../components/BookCard';
import { mockBooks } from '../data/mockData';
import { supabase } from '../lib/supabase';
import './Catalog.css';

export default function Catalog() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAutor = searchParams.get('autor') || '';

  const [searchTerm, setSearchTerm] = useState(selectedAutor);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [categories, setCategories] = useState(['Todos']);

  useEffect(() => {
    if (selectedAutor) {
      setSearchTerm(selectedAutor);
    }
  }, [selectedAutor]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch categories
        const { data: catData } = await supabase.from('categorias').select('nome');
        if (catData && catData.length > 0) {
          setCategories(['Todos', ...catData.map(c => c.nome)]);
        } else {
          setCategories(['Todos', 'Poesia', 'Romance', 'Dramaturgia', 'Audiolivro']);
        }

        // Fetch books
        const { data, error } = await supabase
          .from('obras')
          .select(`
            id,
            titulo,
            sinopse,
            preco_sugerido,
            url_capa,
            tags,
            causa_id,
            usuarios(nome),
            categorias(nome)
          `);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const formattedBooks = data.map(dbBook => ({
            id: dbBook.id,
            title: dbBook.titulo,
            author: dbBook.usuarios?.nome || 'Autor Desconhecido',
            category: dbBook.categorias?.nome || 'Sem Categoria',
            synopsis: dbBook.sinopse,
            coverUrl: dbBook.url_capa || '/src/assets/placeholder.png',
            suggestedPrice: Number(dbBook.preco_sugerido),
            tags: dbBook.tags || [],
            cause: dbBook.causa_id || null
          }));
          setBooks(formattedBooks);
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
    
    fetchData();
  }, []);

  const clearAutorFilter = () => {
    setSearchParams({});
    setSearchTerm('');
  };

  const filteredBooks = books.filter(book => {
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

            {selectedAutor && (
              <div className="active-author-badge flex items-center gap-2 mt-2" style={{ padding: '0.4rem 0.8rem', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '20px', width: 'fit-content', fontSize: '0.85rem', color: '#60a5fa' }}>
                <User size={14} />
                <span>Exibindo obras de: <strong>{selectedAutor}</strong></span>
                <button type="button" onClick={clearAutorFilter} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              </div>
            )}

            
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
        {loading ? (
          <div className="flex justify-center items-center" style={{ minHeight: '40vh' }}>
            <Loader2 className="animate-spin text-primary" size={48} />
          </div>
        ) : (
          <div className="books-grid">
            {filteredBooks.map(book => (
              <BookCard key={book.id} book={book} />
            ))}
            {filteredBooks.length === 0 && (
              <div className="empty-state text-center text-muted" style={{ gridColumn: '1 / -1', padding: '3rem 0' }}>
                <p>Nenhuma obra encontrada para esta busca.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
