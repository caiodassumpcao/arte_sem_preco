import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, User, Menu, X, LogOut, ChevronDown, Book, Feather } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

export default function Header() {
  const { user, isAutor, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  const displayName = user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Usuário';

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fechar ambos os menus ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [location.pathname]);

  // Esc fecha os menus
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setDropdownOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setDropdownOpen(false);
      navigate('/');
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  return (
    <header className="header">
      <div className="container flex justify-between items-center header-inner">
        <Link to="/" className="brand flex items-center gap-2">
          <BookOpen className="text-primary" size={28} />
          <span className="text-serif brand-text">Arte sem Preço</span>
        </Link>
        
        <nav
          id="nav-principal"
          className={`desktop-nav flex ${mobileMenuOpen ? 'mobile-open' : ''}`}
          aria-hidden={mobileMenuOpen ? undefined : 'true'}
        >
          <Link to="/" className="nav-link">Início</Link>
          <Link to="/catalogo" className="nav-link">Catálogo</Link>
          <Link to="/autores" className="nav-link">Autores</Link>
          {user && <Link to="/minha-biblioteca" className="nav-link">Minha Biblioteca</Link>}
          {isAutor && <Link to="/painel" className="nav-link">Painel do Autor</Link>}
        </nav>


        <div className="header-actions flex items-center gap-4">
          {user ? (
            <div className="user-menu-wrapper" ref={dropdownRef}>
              <button 
                type="button"
                className="user-profile-pill"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
                aria-label="Menu do usuário"
              >
                <div className="user-avatar-circle">
                  {displayName.charAt(0).toUpperCase()}
                  <span className="active-dot" title="Sessão ativa"></span>
                </div>
                <div className="user-name-wrapper flex-col text-left hide-mobile">
                  <span className="user-name-text">{displayName}</span>
                  <span className="user-status-text">
                    <span className="pulse-green"></span> Conectado
                  </span>
                </div>
                <ChevronDown size={14} className={`chevron-icon ${dropdownOpen ? 'rotate' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="user-dropdown-menu">
                  <div className="dropdown-header">
                    <strong>{displayName}</strong>
                    <span className="dropdown-email">{user.email}</span>
                  </div>
                  <hr className="dropdown-divider" />
                  <Link
                    to="/minha-biblioteca"
                    className="dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Book size={16} /> Minha Biblioteca
                  </Link>
                  {isAutor && (
                    <Link
                      to="/painel"
                      className="dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <Feather size={16} /> Painel do Autor
                    </Link>
                  )}
                  <hr className="dropdown-divider" />
                  <button
                    type="button"
                    className="dropdown-item logout-btn"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} /> Sair da conta
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn-outline">
              <User size={18} />
              <span>Entrar</span>
            </Link>
          )}

          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((aberto) => !aberto)}
            aria-expanded={mobileMenuOpen}
            aria-controls="nav-principal"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
    </header>
  );
}

