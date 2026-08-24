# Agent Context & Directives: Arte sem Preço

## 1. Visão Geral do Produto
O **Arte sem Preço** é uma biblioteca digital aberta e colaborativa focada em democratizar o acesso à cultura sem desvalorizar o trabalho do artista independente.
- **Slogan Central:** *"A arte tem valor. O preço, você decide."*
- **Premissa Inegociável:** O acesso à obra e o pagamento por ela são fluxos totalmente desacoplados. O acesso nunca é bloqueado por falta de pagamento financeiro.

---

## 2. Princípios de Arquitetura e Regras de Negócio

1. **Acesso Universal:** O usuário pode acessar e baixar qualquer obra pagando R$ 0 ou qualquer valor sugerido/customizado.
2. **Tom Editorial:** A linguagem da interface nunca deve ser reducionista como "baixe grátis" ou "livro gratuito". Deve valorizar a obra e o autor (ex.: *"Acesso aberto — contribua com o valor que puder, quando puder"*).
3. **Divisão Transparente (Split 90/10):** Toda tela de contribuição exibe com clareza:
   - 90% vai diretamente para o artista (ou causa).
   - 10% ajuda a manter a infraestrutura da plataforma.
4. **Selo "Arte que Transforma":** Suporte a obras em que o artista destina parte ou 100% dos rendimentos a causas/instituições beneficentes cadastradas.
5. **Mecanismo "Pague Depois":** Usuários podem adicionar obras à sua Biblioteca Pessoal/Downloads e retornar posteriormente para realizar uma contribuição voluntária.

---

## 3. Escopo do MVP (v1)

- **Foco de Conteúdo:** Literatura (Livros, Audiolivros, Poesia, Dramaturgia em formatos como PDF/EPUB/áudio).
- **Funcionalidades Principais:**
  1. **Landing Page:** Manifesto do projeto, destaques editoriais, vitrine do "Arte que Transforma" e busca rápida.
  2. **Catálogo & Filtros:** Listagem de obras por categoria literária, tags de causas e novidades.
  3. **Página da Obra:** Sinopse, metadados, perfil do autor, botão de Acesso Aberto (R$ 0) e seletor de Contribuição Voluntária com split 90/10 transparente.
  4. **Fluxo de Pagamento/Contribuição:** Interface simulada/integrada para Pix (prioritário) e Cartão de Crédito.
  5. **Área "Minha Biblioteca":** Histórico de obras acessadas com botão rápido de "Contribuir agora" (fluxo Pague Depois).
  6. **Painel do Autor (Simples):** Cadastro de novas obras, definição de faixas sugeridas (apenas informativas) e relatório de acessos vs. contribuições recebidas.

---

## 4. Diretrizes Técnicas para o Agente

- **Stack Leve & Estática/Modular:** Interface limpa, responsiva (Mobile First / PWA ready), otimizada para hospedagem estática/simples (ex.: Vercel, Netlify, Cloudflare Pages ou VPS simples com Nginx).
- **Persistência do MVP:** Utilizar `localStorage` / Mock DB / Supabase/Firebase ou API REST modular para dados locais e testes rápidos.
- **Identidade Visual:** Minimalista, editorial, limpa, com tipografia legível e contrastante, transmitindo dignidade artística, transparência e acolhimento.