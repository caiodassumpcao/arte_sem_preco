import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Bloqueia rotas que exigem sessão.
 * `requireAutor` exige, além da sessão, o flag is_autor no perfil.
 */
export default function ProtectedRoute({ children, requireAutor = false }) {
  const { user, perfil, loadingPerfil } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requireAutor) {
    if (loadingPerfil) {
      return (
        <div className="route-guard-loading">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      );
    }
    if (!perfil?.is_autor) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
