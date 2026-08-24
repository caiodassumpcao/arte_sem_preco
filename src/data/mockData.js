export const mockBooks = [
  {
    id: 1,
    title: "Eco do Vento",
    author: "Marina Salles",
    category: "Poesia",
    synopsis: "Uma coletânea de poemas que exploram a solidão urbana, o ruído das cidades e a busca pelo silêncio interior. 'Eco do Vento' traduz a experiência moderna de estar só no meio da multidão.",
    coverUrl: "/src/assets/placeholder.png",
    suggestedPrice: 15.0,
    tags: ["Arte que Transforma", "Lançamento"],
    cause: "Instituto Reflorestar"
  },
  {
    id: 2,
    title: "O Relógio de Areia",
    author: "Roberto Cavalcante",
    category: "Romance",
    synopsis: "Quando o tempo começa a correr para trás em uma pequena cidade do interior, seus habitantes têm que confrontar as escolhas do passado. Um romance sobre arrependimentos e segundas chances.",
    coverUrl: "/src/assets/placeholder.png",
    suggestedPrice: 35.0,
    tags: ["Destaque"],
    cause: null
  },
  {
    id: 3,
    title: "Vozes do Palco",
    author: "Helena Castro",
    category: "Dramaturgia",
    synopsis: "Três peças curtas sobre os dilemas da arte e do artista no século XXI. Escrito durante o isolamento, este livro traz reflexões sobre o teatro sem plateia.",
    coverUrl: "/src/assets/placeholder.png",
    suggestedPrice: 20.0,
    tags: ["Arte que Transforma"],
    cause: "Fundo de Apoio ao Trabalhador da Cultura"
  },
  {
    id: 4,
    title: "Além do Horizonte (Audiolivro)",
    author: "Pedro Almeida",
    category: "Audiolivro",
    synopsis: "Uma jornada épica narrada pelo próprio autor. Descubra os mistérios além das montanhas esquecidas e os povos que lá habitam.",
    coverUrl: "/src/assets/placeholder.png",
    suggestedPrice: 25.0,
    tags: ["Ficção Fantástica"],
    cause: null
  },
  {
    id: 5,
    title: "Fragmentos de Um Sonho",
    author: "Clara Nunes",
    category: "Poesia",
    synopsis: "Textos curtos e viscerais sobre o amor e a perda. Clara nos convida a entender que cada pedaço quebrado também conta uma história.",
    coverUrl: "/src/assets/placeholder.png",
    suggestedPrice: 12.0,
    tags: ["Arte que Transforma", "Novidade"],
    cause: "Apoio a Mulheres em Situação de Vulnerabilidade"
  },
  {
    id: 6,
    title: "Sombras na Cidade",
    author: "Felipe Braga",
    category: "Romance",
    synopsis: "Um thriller psicológico que acompanha os passos de um detetive pelas ruas escuras de uma metrópole que esconde mais segredos do que mostra.",
    coverUrl: "/src/assets/placeholder.png",
    suggestedPrice: 28.0,
    tags: [],
    cause: null
  }
];

export const getBookById = (id) => mockBooks.find(book => book.id === parseInt(id));
