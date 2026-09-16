# Análise de Responsividade Mobile — Arte sem Preço

Data: 2026-09-16 · Escopo: `src/**/*.css` e `src/**/*.jsx`

## 1. Veredito

**Não responsivo em mobile.** A base existe (meta viewport correta, `box-sizing: border-box` global, grids com `auto-fill`), mas o sistema de responsividade está incompleto: o menu mobile do header não tem CSS nenhum, e 87 classes usadas no JSX não existem em CSS algum — incluindo duas classes com sintaxe Tailwind em um projeto sem Tailwind.

Nota estimada: **3/10**.

## 2. Inventário de breakpoints

| Arquivo | Media queries | Observação |
|---|---|---|
| `index.css` | 1 | apenas `prefers-color-scheme` |
| `App.css` | 6 | **código morto** (template Vite) |
| `Home.css` | 2 | 992px, 768px |
| `Footer.css` | 1 | 768px |
| `BookDetails.css` | 1 | 900px |
| `Auth.css` | 2 | `min-width: 900px` (mobile-first) |
| `Dashboard.css` | 3 | 640px, 1024px (mobile-first) |
| `Library.css` | 1 | apenas `prefers-color-scheme` |
| `Header.css` | 1 | apenas `prefers-color-scheme` |
| `Catalog.css` | **0** | — |
| `Authors.css` | **0** | — |
| `BookCard.css` | **0** | — |
| `OngsTicker.css` | **0** | — |

Breakpoints usados: 640, 768, 900, 992, 1024 — **cinco valores diferentes, sem padrão e sem variáveis**. Metade dos arquivos mistura `max-width` (desktop-first) com `min-width` (mobile-first).

## 3. Defeitos por severidade

### P0 — Bloqueantes

**3.1 Header não colapsa. Menu mobile inexistente.**
`Header.jsx` usa `desktop-nav`, `mobile-open`, `mobile-menu-btn` e `hide-mobile`. **Nenhuma dessas classes existe em qualquer CSS do projeto.**

Consequências em telas ≤ 480px:
- Cinco links de navegação inline (`Início`, `Catálogo`, `Autores`, `Minha Biblioteca`, `Para Artistas`) permanecem visíveis e comprimem tudo.
- O botão hambúrguer aparece **também no desktop** (sem CSS para escondê-lo) e o `onClick` não produz efeito visual algum.
- `hide-mobile` não esconde nada: o bloco nome + "Conectado" continua ocupando espaço.
- Resultado: header de 80px com overflow horizontal e links ilegíveis.

**3.2 Página de Autores sem responsividade.**
`.authors-grid` usa `minmax(320px, 1fr)`. O `.container` tem `padding: 0 24px`. Em viewport de 360px sobram 312px < 320px → a coluna estoura o container. Combinado com `.authors-hero-title` em `2.8rem` fixo, há scroll horizontal.

**3.3 Ticker de ONGs: `.ong-card { width: 320px }` fixo.**
Dentro de um marquee com `width: max-content`. Em 360px o card ocupa quase toda a largura útil; o marquee de 35s em `translateX(-50%)` continua rodando, sem respeito a `prefers-reduced-motion`.

### P1 — Altos

**3.4 87 classes sem definição CSS.** Levantamento automatizado sobre os 15 arquivos JSX:

```
classes usadas:          323
sem definição em CSS:     87  (27%)
```

Amostra das mais frequentes: `animate-spin` (11 usos — **todos os spinners de loading estão estáticos**), `gap-1` (8), `mb-1` (7), `font-bold` (4), `p-3` (4), `py-2` (4), `min-h-screen` (3), `w-full` (3), `flex-wrap` (3), `max-w-md` (2), `border-t` (2), `text-red-600`, `bg-red-50`, `py-12`, `uppercase`, `tracking-wider`, `mt-auto`, `opacity-60`…

Também sem definição: `stat-pill`, `library-stats-grid`, `empty-library-card`, `book-cover-col`, `book-info-col`, `widget-header`, `widget-body`, `split-preview`, `action-buttons`, `meta-item`, `item-author`, `item-actions`, `footer-brand`, `header-actions`, `brand` — ou seja, **classes semânticas do próprio projeto que nunca foram escritas**.

**3.5 Duas classes Tailwind em projeto sem Tailwind.**
`md:flex-row` e `sm:flex-row` em `Success.jsx`. O card da obra fica empilhado em qualquer largura — o layout desktop nunca é atingido.

**3.6 Widget de contribuição quebra no celular.**
`BookDetails.jsx` coloca em um `flex` de uma linha: três `preset-btn` (`padding: 12px 16px`) + um input numérico com `flex: 1`. O `@media (max-width: 900px)` aplica `flex-wrap: wrap` a `.contribution-input-group .flex`, mas o input mantém `flex: 1` e comprime até ficar inutilizável. É o componente central de monetização.

**3.7 `.split-preview` e `.action-buttons` sem CSS.**
Em `BookDetails`, o comparativo 90/10 e os dois botões de ação dependem de utilitários (`justify-between`, `flex-1`, `gap-4`) que existem parcialmente. Em ≤ 400px os botões "Contribuir e Baixar" + botão de coração não caem para coluna.

**3.8 Catálogo sem media query.**
`.catalog-header { padding: 60px 0 40px }` e `.catalog-title { font-size: 3rem }` fixos. O título consome ~3 linhas em 360px. `.search-input` tem `padding-left: 48px` com `max-width: 600px` — aceitável, mas sem ajuste de altura de toque.

**3.9 Painel do Autor: cabeçalho e tabela.**
`Dashboard.jsx` usa `display: flex; justifyContent: space-between` **inline** no cabeçalho, sem `flex-wrap`. O título "Painel do Autor" e o botão "+ Publicar Nova Obra" ficam lado a lado e comprimidos em 360px. A tabela tem `.table-responsive` com `overflow-x: auto` (correto), mas sem indicação visual de scroll.

### P2 — Médios

**3.10 Alvos de toque abaixo de 44px.**
- `.tab-btn`: `padding: 8px 16px` + `font-size: 0.875rem` → ~33px de altura.
- `.genre-pill`: `padding: 0.4rem 1rem` → ~29px.
- `.filter-btn`: `padding: 8px 16px` → ~33px.
- Botão de fechar filtro de autor (`X size={14}`) em `Catalog.jsx`: área efetiva ~14px.

Diretriz WCAG 2.5.5 / iOS HIG: mínimo 44×44px.

**3.11 Abas da Biblioteca com labels longos.**
"Salvas para Pagar Depois (0)" e "Apoiadas (0)" com `white-space: nowrap` dentro de `.library-tabs { overflow-x: auto }`. Funciona, mas sem `scroll-snap`, sem gradiente de borda e sem indicação de conteúdo cortado.

**3.12 Tipografia sem escala fluida.**
Apenas `.hero-title` usa `clamp()`. Tamanhos fixos em `.catalog-title` (3rem), `.detail-title` (3.5rem), `.authors-hero-title` (2.8rem), `.section-title` (2.5rem), `.author-cta-title` (2.2rem), `.curator-title` (2.25rem).

**3.13 Grid de livros: 300px de mínimo.**
`.books-grid { minmax(300px, 1fr) }` — com o container de 24px de padding, cabe em 360px por 12px de margem. Em 320px (iPhone SE) estoura.

**3.14 Paletas conflitantes.**
`Authors.css`, `OngsTicker.css` e `Dashboard.css` hardcodam cores dark (`#0f172a`, `#1a1a1a`, `#f8fafc`) enquanto `index.css` define tema claro (`--background: #fbf9f6`). Em modo claro no celular, texto `#f8fafc` sobre fundo claro = contraste insuficiente. `Dashboard.css` força `color: #ffffff` na página inteira.

**3.15 `prefers-reduced-motion` ausente.**
Animações contínuas sem opt-out: marquee de 35s (`OngsTicker`), `rotateCircle` de 35s (avatar do curador), `heartPop`, `fadeIn`. Custo de bateria e risco de desconforto vestibular.

**3.16 Header fixo com compensação hardcoded.**
`.main-content { padding-top: 80px }` casado com `.header-inner { height: 80px }`. Se o header quebrar em duas linhas no mobile, o conteúdo fica encoberto.

**3.17 Peso de assets.**
`placeholder.png` = 678 KB, usado como fallback de capa em Home, Catalog, BookDetails, Library e Success. Sem `loading="lazy"`, sem `srcset`, sem WebP/AVIF. Em 3G isso é bloqueante.

**3.18 Sem PWA.**
README e `agent.md` declaram "PWA ready". Não há manifest, service worker nem `theme-color`.

**3.19 `100vh` em mobile.**
`.hero { min-height: 80vh }`, `min-height: calc(100vh - 80px)` em várias páginas. Em Safari iOS a barra de endereço causa salto de layout. Usar `dvh`.

## 4. Plano de correção

### Sprint 1 — desbloquear o mobile (1–2 dias)

1. Escrever o CSS do header mobile: `.desktop-nav` como drawer/overlay em ≤ 768px, `.mobile-menu-btn` visível só em ≤ 768px, `.hide-mobile { display: none }` em ≤ 640px, `.header-actions` com gap reduzido.
2. Padronizar breakpoints em um único arquivo:
   ```css
   /* sm 640 · md 768 · lg 1024 · xl 1280 — mobile-first, sempre min-width */
   ```
   Converter as media queries `max-width` existentes.
3. Criar as 87 classes faltantes ou remover seu uso. Prioridade absoluta em `animate-spin` (11 usos) — hoje nenhum spinner gira.
4. Substituir `md:flex-row` / `sm:flex-row` em `Success.jsx` por classes próprias.
5. `.authors-grid` e `.books-grid`: `minmax(min(100%, 280px), 1fr)`.
6. `.ong-card`: `width: min(320px, 85vw)`.
7. Deletar `App.css`.

### Sprint 2 — usabilidade de toque (1 dia)

8. Piso de 44px de altura e área de toque em `.tab-btn`, `.genre-pill`, `.filter-btn`, `.favorite-btn`, botões de ícone.
9. Widget de contribuição: em ≤ 640px, presets em grid `repeat(3, 1fr)` e input em linha própria full-width.
10. `.action-buttons`: `flex-direction: column` em ≤ 480px.
11. Cabeçalho do Dashboard: mover os estilos inline para CSS com `flex-wrap: wrap`.
12. Adicionar `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important } }`.

### Sprint 3 — consistência e performance (2 dias)

13. Migrar `Authors.css`, `OngsTicker.css` e `Dashboard.css` para os tokens de `index.css`; eliminar cores hardcoded.
14. Resolver as colisões de classe global (`.search-input`, `.modal-overlay`, `.badge`) — prefixar por página ou adotar CSS Modules.
15. Tipografia fluida com `clamp()` em todos os títulos.
16. Converter `placeholder.png` para WebP ≤ 40 KB; `loading="lazy"` + `width`/`height` em todas as capas.
17. Trocar `vh` por `dvh`.
18. Adicionar manifest + service worker (`vite-plugin-pwa`) para cumprir a promessa de PWA.

### Validação

19. Testar em 320, 360, 390, 414, 768, 1024, 1280px.
20. Lighthouse mobile — meta: Performance ≥ 80, Accessibility ≥ 90.
21. Teste manual em Safari iOS (barra de endereço) e Chrome Android.
