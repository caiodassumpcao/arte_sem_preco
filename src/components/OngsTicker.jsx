import React from 'react';
import { Sparkles, HeartHandshake, ExternalLink } from 'lucide-react';
import { mockOngs } from '../data/mockData';
import './OngsTicker.css';

export default function OngsTicker({ title = "Instituições e Causas no Arte que Transforma" }) {
  // Duplicamos a lista para criar o efeito infinito contínuo (marquee) sem cortes
  const doubleOngs = [...mockOngs, ...mockOngs];

  return (
    <div className="ongs-section">
      <div className="container text-center mb-6">
        <div className="inline-flex items-center gap-2 badge badge-accent mb-2">
          <Sparkles size={14} />
          <span>Rede de Cuidado e Impacto</span>
        </div>
        <h3 className="ongs-section-title">{title}</h3>
        <p className="ongs-section-subtitle text-muted">
          Ao escolher valorizar uma obra com a tag <strong>Arte que Transforma</strong>, você apoia diretamente estas iniciativas:
        </p>
      </div>

      <div className="ongs-marquee-container">
        <div className="ongs-marquee-gradient left"></div>
        <div className="ongs-marquee-gradient right"></div>

        <div className="ongs-marquee-track">
          {doubleOngs.map((ong, index) => (
            <div key={`${ong.id}-${index}`} className="ong-card">
              <div className="ong-header">
                <div
                  className="ong-icon-wrapper"
                  style={{ backgroundColor: `${ong.logoColor}20`, color: ong.logoColor, borderColor: `${ong.logoColor}40` }}
                >
                  <span className="ong-icon">{ong.icone}</span>
                </div>
                <div className="ong-titles">
                  <h4 className="ong-name">{ong.nome}</h4>
                  <span className="ong-type" style={{ color: ong.logoColor }}>{ong.tipo}</span>
                </div>
              </div>
              <p className="ong-description">{ong.descricao}</p>
              <div className="ong-footer flex items-center justify-between">

                <span className="ong-link flex items-center gap-1">
                  Transparência <ExternalLink size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
