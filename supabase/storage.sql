-- Criação do bucket de Storage para as Obras (Capas e PDFs/EPUBs)
INSERT INTO storage.buckets (id, name, public) VALUES ('obras', 'obras', true);

-- Políticas de Segurança (RLS) para o Storage

-- 1. Qualquer pessoa pode visualizar/baixar os arquivos (public = true permite isso por padrão, mas é bom garantir)
CREATE POLICY "Leitura pública de obras" ON storage.objects
FOR SELECT
USING ( bucket_id = 'obras' );

-- 2. Apenas usuários autenticados (Autores) podem fazer upload
CREATE POLICY "Autores podem fazer upload" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'obras' AND auth.role() = 'authenticated'
);

-- 3. Autores só podem deletar/atualizar seus próprios arquivos (verificação baseada no owner)
CREATE POLICY "Autores gerenciam seus arquivos" ON storage.objects
FOR UPDATE
USING ( auth.uid() = owner )
WITH CHECK ( bucket_id = 'obras' );

CREATE POLICY "Autores podem deletar seus arquivos" ON storage.objects
FOR DELETE
USING ( auth.uid() = owner AND bucket_id = 'obras' );
