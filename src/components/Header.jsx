import { Link } from 'react-router-dom';
import { BookOpen, User, Menu } from 'lucide-react';
import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="container flex justify-between items-center header-inner">
        <Link to="/" className="brand flex items-center gap-2">
          <BookOpen className="text-primary" size={28} />
          <span className="text-serif brand-text">Arte sem Preço</span>
        </Link>
        
        <nav className="desktop-nav flex items-center gap-6">
          <Link to="/" className="nav-link">Início</Link>
          <Link to="/catalogo" className="nav-link">Catálogo</Link>
          <Link to="/minha-biblioteca" className="nav-link">Minha Biblioteca</Link>
          <Link to="/painel" className="nav-link">Para Artistas</Link>
        </nav>

        <div className="header-actions flex items-center gap-4">
          <Link to="/minha-biblioteca" className="btn btn-outline flex items-center gap-2">
            <User size={18} />
            <span className="hide-mobile">Entrar</span>
          </Link>
          <button className="mobile-menu-btn">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
}
