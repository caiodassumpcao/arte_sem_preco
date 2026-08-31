import placeholderImg from '../assets/placeholder.png';

export const mockBooks = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Eco do Vento",
    author: "Marina Salles",
    category: "Poesia",
    synopsis: "Uma coletânea de poemas que exploram a solidão urbana, o ruído das cidades e a busca pelo silêncio interior. 'Eco do Vento' traduz a experiência moderna de estar só no meio da multidão.",
    coverUrl: placeholderImg,
    suggestedPrice: 15.0,
    tags: ["Arte que Transforma", "Lançamento"],
    cause: "Instituto Reflorestar"
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    title: "O Relógio de Areia",
    author: "Roberto Cavalcante",
    category: "Romance",
    synopsis: "Quando o tempo começa a correr para trás em uma pequena cidade do interior, seus habitantes têm que confrontar as escolhas do passado. Um romance sobre arrependimentos e segundas chances.",
    coverUrl: placeholderImg,
    suggestedPrice: 35.0,
    tags: ["Destaque"],
    cause: null
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    title: "Vozes do Palco",
    author: "Helena Castro",
    category: "Dramaturgia",
    synopsis: "Três peças curtas sobre os dilemas da arte e do artista no século XXI. Escrito durante o isolamento, este livro traz reflexões sobre o teatro sem plateia.",
    coverUrl: placeholderImg,
    suggestedPrice: 20.0,
    tags: ["Arte que Transforma"],
    cause: "Fundo de Apoio ao Trabalhador da Cultura"
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    title: "Além do Horizonte (Audiolivro)",
    author: "Pedro Almeida",
    category: "Audiolivro",
    synopsis: "Uma jornada épica narrada pelo próprio autor. Descubra os mistérios além das montanhas esquecidas e os povos que lá habitam.",
    coverUrl: placeholderImg,
    suggestedPrice: 25.0,
    tags: ["Ficção Fantástica"],
    cause: null
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    title: "Fragmentos de Um Sonho",
    author: "Clara Nunes",
    category: "Poesia",
    synopsis: "Textos curtos e viscerais sobre o amor e a perda. Clara nos convida a entender que cada pedaço quebrado também conta uma história.",
    coverUrl: placeholderImg,
    suggestedPrice: 12.0,
    tags: ["Arte que Transforma", "Novidade"],
    cause: "Apoio a Mulheres em Situação de Vulnerabilidade"
  },
  {
    id: "00000000-0000-0000-0000-000000000006",
    title: "Sombras na Cidade",
    author: "Felipe Braga",
    category: "Romance",
    synopsis: "Um thriller psicológico que acompanha os passos de um detetive pelas ruas escuras de uma metrópole que esconde mais segredos do que mostra.",
    coverUrl: placeholderImg,
    suggestedPrice: 28.0,
    tags: [],
    cause: null
  }
];

export const getBookById = (id) => mockBooks.find(book => String(book.id) === String(id));

export const mockAuthors = [
  {
    id: "autor-1",
    nome: "Marina Salles",
    bio: "Poetisa e ensaísta paulistana. Explora os sentimentos urbanos, a solidão das metrópoles e a poesia minimalista. Autora de 'Eco do Vento'.",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    generos: ["Poesia", "Ensaios"],
    obrasCount: 1,
    causaApoiada: "Instituto Reflorestar",
    cidade: "São Paulo, SP"
  },
  {
    id: "autor-2",
    nome: "Roberto Cavalcante",
    bio: "Escritor de ficção e romances psicológicos. Vencedor de prêmios regionais de literatura independente com abordagens sobre memória e tempo.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    generos: ["Romance", "Ficção"],
    obrasCount: 1,
    cidade: "Belo Horizonte, MG"
  },
  {
    id: "autor-3",
    nome: "Helena Castro",
    bio: "Dramaturga e roteirista de teatro experimental. Seus textos discutem o papel da arte em momentos de crise social e isolamento.",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    generos: ["Dramaturgia", "Teatro"],
    obrasCount: 1,
    causaApoiada: "Fundo de Apoio ao Trabalhador da Cultura",
    cidade: "Rio de Janeiro, RJ"
  },
  {
    id: "autor-4",
    nome: "Pedro Almeida",
    bio: "Narrador e criador de mundos fantásticos. Pioneiro na produção de audiolivros independentes no Brasil com sonorações autorais.",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    generos: ["Audiolivro", "Fantasia"],
    obrasCount: 1,
    cidade: "Curitiba, PR"
  },
  {
    id: "autor-5",
    nome: "Clara Nunes",
    bio: "Escritora, ativista e estudante de letras. Dedica sua produção literária ao empoderamento feminino e à escuta de narrativas periféricas.",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
    generos: ["Poesia", "Feminismo"],
    obrasCount: 1,
    causaApoiada: "Apoio a Mulheres em Situação de Vulnerabilidade",
    cidade: "Salvador, BA"
  },
  {
    id: "autor-6",
    nome: "Felipe Braga",
    bio: "Autor de romances de suspense e mistério urbano. Explora os bastidores das sombras das grandes cidades brasileiras.",
    avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80",
    generos: ["Romance", "Suspense"],
    obrasCount: 1,
    cidade: "Porto Alegre, RS"
  }
];

export const mockOngs = [
  {
    id: "ong-1",
    nome: "Instituto Reflorestar",
    tipo: "Ecologia & Meio Ambiente",
    descricao: "Plantio de árvores nativas na Mata Atlântica a cada contribuição realizada.",
    icone: "🌱",
    logoColor: "#10b981"
  },
  {
    id: "ong-2",
    nome: "Fundo de Apoio à Cultura",
    tipo: "Cultura & Arte Independente",
    descricao: "Suporte emergencial e bolsas de incentivo para artistas periféricos.",
    icone: "🎭",
    logoColor: "#8b5cf6"
  },
  {
    id: "ong-3",
    nome: "Apoio a Mulheres na Arte",
    tipo: "Direitos Humanos & Gênero",
    descricao: "Capacitação literária, publicação e acolhimento para escritoras.",
    icone: "💜",
    logoColor: "#ec4899"
  },
  {
    id: "ong-4",
    nome: "Casa das Letras Acolhedoras",
    tipo: "Educação & Alfabetização",
    descricao: "Doação de livros e mediação de leitura em bibliotecas comunitárias.",
    icone: "📚",
    logoColor: "#f59e0b"
  },
  {
    id: "ong-5",
    nome: "Projeto Livros Livres",
    tipo: "Inclusão & Acessibilidade",
    descricao: "Produção de obras em Braille e audiolivros táteis para deficientes visuais.",
    icone: "🎧",
    logoColor: "#3b82f6"
  },
  {
    id: "ong-6",
    nome: "Instituto Arte & Vida",
    tipo: "Juventude & Periferia",
    descricao: "Oficinas gratuitas de poesia, slam e escrita criativa para jovens da periferia.",
    icone: "🎨",
    logoColor: "#06b6d4"
  }
];


