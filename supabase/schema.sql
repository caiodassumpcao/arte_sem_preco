-- Estrutura de banco de dados para MVP do Arte sem Preço

-- Criação da tabela de Usuários (Estendendo a autenticação do Supabase)
CREATE TABLE public.usuarios (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  is_autor BOOLEAN DEFAULT false,
  chave_pix TEXT, -- Chave pix do autor para o split (se for autor)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para usuários
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários podem ver o próprio perfil" ON public.usuarios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuários podem editar o próprio perfil" ON public.usuarios FOR UPDATE USING (auth.uid() = id);

-- Criação da tabela de Categorias
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

-- Criação da tabela de Causas
CREATE TABLE public.causas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT
);

-- Criação da tabela de Obras
CREATE TABLE public.obras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  autor_id UUID REFERENCES public.usuarios(id) NOT NULL,
  titulo TEXT NOT NULL,
  sinopse TEXT NOT NULL,
  categoria_id UUID REFERENCES public.categorias(id),
  causa_id UUID REFERENCES public.causas(id),
  preco_sugerido DECIMAL(10, 2) DEFAULT 0.00,
  url_capa TEXT, -- Link da imagem no bucket do Supabase Storage
  url_arquivo TEXT, -- Link do PDF/EPUB no bucket do Supabase Storage
  tags TEXT[], -- Ex: ['Arte que Transforma', 'Novidade']
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para obras
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
-- Todos podem ver as obras
CREATE POLICY "Obras são públicas para visualização" ON public.obras FOR SELECT USING (true);
-- Apenas autores podem inserir/editar suas obras
CREATE POLICY "Autores podem gerenciar suas obras" ON public.obras FOR ALL USING (auth.uid() = autor_id);

-- Criação da tabela de Transações (Histórico de contribuições)
CREATE TABLE public.transacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID REFERENCES public.usuarios(id), -- Quem pagou/baixou
  obra_id UUID REFERENCES public.obras(id) NOT NULL,
  valor_pago DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Pode ser 0.00
  status TEXT DEFAULT 'concluido', -- pendente, concluido, falhou
  gateway_id TEXT, -- ID da transação no Mercado Pago
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para transações
ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;
-- Usuários podem ver apenas suas próprias transações
CREATE POLICY "Usuários veem suas transações" ON public.transacoes FOR SELECT USING (auth.uid() = usuario_id);
-- Autores podem ver transações referentes às suas obras
CREATE POLICY "Autores veem transações de suas obras" ON public.transacoes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.obras
    WHERE obras.id = transacoes.obra_id AND obras.autor_id = auth.uid()
  )
);
