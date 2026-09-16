# ✦ Arte sem Preço

> *"A arte não deveria deixar de chegar a alguém porque essa pessoa não pode pagar por ela hoje."*

O **Arte sem Preço** é uma biblioteca digital aberta e colaborativa voltada para autores e artistas independentes. A plataforma desacopla o acesso à obra do pagamento por ela: o leitor tem acesso universal imediato e escolhe voluntariamente quanto e quando pagar.

---

## 💡 Princípios Centrais

1. **Acesso Universal:** O acesso a nenhuma obra é condicionado ao pagamento prévio. O leitor pode acessar a R$ 0,00 ou definir qualquer valor de contribuição.
2. **Tom Editorial Consciente:** Rejeição do formato "download gratuito descartável". A obra tem valor e o autor é valorizado pelo seu trabalho.
3. **Divisão Transparente (Split 90/10):** 
   - **90%** do valor voluntário vai diretamente ao autor (ou à causa vinculada).
   - **10%** cobre exclusivamente os custos de infraestrutura e manutenção da plataforma.
4. **Mecanismo "Pague Depois":** Obras acessadas permanecem na biblioteca do leitor com link direto para contribuição retroativa a qualquer momento.
5. **Arte que Transforma:** Espaço opcional onde o autor destina seus rendimentos a causas sociais ou comunitárias.

---

## 🛠️ Stack Tecnológica & Arquitetura

O projeto adota o paradigma **JAMstack / Serverless** para operar com **custo fixo zero** na fase de validação (MVP):

- **Frontend:** React 19 + Vite, CSS puro com design tokens e utilitários próprios em `src/index.css` (mobile-first)
- **Hospedagem & CDN:** Vercel / Cloudflare Pages (Deploy contínuo e SSL automático)
- **Backend & Auth:** Supabase (PostgreSQL, Auth com RLS e Edge Functions)
- **Storage:** Cloudflare R2 / Supabase Storage (distribuição de PDFs/EPUBs com *zero egress fee*)
- **Processamento de Pagamento:** Mercado Pago Checkout Pro (Pix e cartão) via Supabase Edge Functions

---

## 📁 Estrutura do Projeto

```text
arte_sem_preco/
├── .antigravity/            # Configurações e diretrizes da IDE / Agente
├── docs/                    # Documentos de Arquitetura e Requisitos (SRS)
├── src/                     # Código-fonte da aplicação (Componentes, Páginas, Hooks)
│   ├── assets/              # Estilos, ícones e mídias
│   ├── components/          # Modais de contribuição, vitrines, player/leitor
│   └── data/                # Mock data de obras e causas (MVP)
├── .env.example             # Variáveis de ambiente de exemplo
├── .gitignore               # Arquivos ignorados pelo Git
├── index.html               # Ponto de entrada / Protótipo interativo
└── README.md                # Documentação principal
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js (v18+) ou servidor web estático (ex: Live Server / Nginx local)
- Git instalado

### Instalação

1. Clone o repositório:
```bash
git clone [https://github.com/SEU_USUARIO/arte_sem_preco.git](https://github.com/SEU_USUARIO/arte_sem_preco.git)
cd arte_sem_preco
```

2. Instale as dependências (caso use pipeline Node/Vite):
```bash
npm install
```

3. Inicie o ambiente de desenvolvimento:
```bash
npm run dev
```

4. Acesse no navegador: `http://localhost:5173` (ou abra o `index.html` via Live Server).

---

## 🔒 Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_ANON_KEY=sua_publishable_key_supabase
```

> **Atenção:** apenas chaves **públicas** entram no `.env`. Os segredos do Mercado Pago
> ficam exclusivamente em secrets das Edge Functions:
>
> ```bash
> supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...
> supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=...
> supabase secrets set SITE_URL=https://seu-dominio
> ```
>
> Ver `docs/` para documentação, plano de schema e plano do gateway.

---

## 📄 Licença e Direitos

Os autores mantêm 100% dos direitos autorais de suas respectivas obras. A plataforma atua unicamente sob licença não-exclusiva de hospedagem e distribuição.