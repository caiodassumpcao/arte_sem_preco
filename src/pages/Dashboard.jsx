import { BarChart3, Upload, DollarSign, Users } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
  return (
    <div className="dashboard-page bg-surface">
      <div className="container py-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-serif text-3xl mb-2">Painel do Artista</h1>
            <p className="text-muted">Bem-vindo, acompanhe o impacto de suas obras.</p>
          </div>
          <button className="btn btn-primary flex items-center gap-2">
            <Upload size={18} /> Publicar Obra
          </button>
        </div>

        {/* Metrics */}
        <div className="metrics-grid mb-8">
          <div className="metric-card card p-6">
            <div className="flex items-center gap-3 mb-4 text-muted">
              <Users size={20} />
              <span className="font-medium uppercase text-sm">Leitores (Total)</span>
            </div>
            <div className="metric-value text-3xl font-bold text-serif">1,248</div>
            <div className="text-xs text-primary mt-2">+12% este mês</div>
          </div>
          <div className="metric-card card p-6">
            <div className="flex items-center gap-3 mb-4 text-muted">
              <DollarSign size={20} />
              <span className="font-medium uppercase text-sm">Contribuições (R$)</span>
            </div>
            <div className="metric-value text-3xl font-bold text-serif text-primary">R$ 4.850</div>
            <div className="text-xs text-muted mt-2">Valor líquido (split 90%)</div>
          </div>
          <div className="metric-card card p-6">
            <div className="flex items-center gap-3 mb-4 text-muted">
              <BarChart3 size={20} />
              <span className="font-medium uppercase text-sm">Conversão Média</span>
            </div>
            <div className="metric-value text-3xl font-bold text-serif">28%</div>
            <div className="text-xs text-muted mt-2">Pagaram vs. Acessaram</div>
          </div>
        </div>

        {/* Works List */}
        <div className="card p-6">
          <h2 className="text-xl font-bold mb-6">Minhas Obras</h2>
          <div className="table-responsive">
            <table className="works-table">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Downloads</th>
                  <th>Contribuições</th>
                  <th>Valor Sugerido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">Eco do Vento</td>
                  <td>850</td>
                  <td>R$ 3.200</td>
                  <td>R$ 15,00</td>
                  <td><span className="badge badge-accent">Ativo</span></td>
                </tr>
                <tr>
                  <td className="font-medium">Fragmentos de Um Sonho</td>
                  <td>398</td>
                  <td>R$ 1.650</td>
                  <td>R$ 12,00</td>
                  <td><span className="badge badge-accent">Ativo</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
