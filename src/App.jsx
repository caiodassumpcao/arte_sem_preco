import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Authors from './pages/Authors';
import BookDetails from './pages/BookDetails';
import Library from './pages/Library';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Success from './pages/Success';
import LinkCurto from './pages/LinkCurto';
import { AuthProvider } from './contexts/AuthContext';

function NotFound() {
  return (
    <div className="container py-20 text-center">
      <h1 className="mb-4">Página não encontrada</h1>
      <p className="text-muted mb-6">O endereço acessado não existe.</p>
      <Link to="/" className="btn btn-primary">Voltar ao início</Link>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-layout">
          <Header />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalogo" element={<Catalog />} />
              <Route path="/autores" element={<Authors />} />
              <Route path="/obra/:id" element={<BookDetails />} />
              <Route path="/o/:codigo" element={<LinkCurto />} />
              <Route
                path="/sucesso"
                element={<ProtectedRoute><Success /></ProtectedRoute>}
              />
              <Route
                path="/minha-biblioteca"
                element={<ProtectedRoute><Library /></ProtectedRoute>}
              />
              <Route
                path="/perfil"
                element={<ProtectedRoute><Profile /></ProtectedRoute>}
              />
              <Route
                path="/painel"
                element={<ProtectedRoute requireAutor><Dashboard /></ProtectedRoute>}
              />
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Register />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
