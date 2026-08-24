import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="brand flex items-center gap-2">
              <BookOpen className="text-primary" size={24} />
              <span className="text-serif brand-text">Arte sem Preço</span>
            </Link>
            <p className="footer-slogan text-muted">
              A arte tem valor. O preço, você decide.
            </p>
          </div>
          
          <div className="footer-links">
            <h4>Plataforma</h4>
            <ul>
              <li><Link to="/catalogo">Explorar Catálogo</Link></li>
              <li><Link to="/arte-que-transforma">Arte que Transforma</Link></li>
              <li><Link to="/manifesto">Nosso Manifesto</Link></li>
            </ul>
          </div>
          
          <div className="footer-links">
            <h4>Para Artistas</h4>
            <ul>
              <li><Link to="/painel">Publicar Obra</Link></li>
              <li><Link to="/como-funciona">Como Funciona</Link></li>
              <li><Link to="/transparencia">Transparência (Split 90/10)</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="footer-bottom flex justify-between items-center text-muted">
          <p>&copy; {new Date().getFullYear()} Arte sem Preço. Todos os direitos reservados.</p>
          <div className="footer-legal flex gap-4">
            <Link to="/termos">Termos de Uso</Link>
            <Link to="/privacidade">Privacidade</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
