// Uma obra tem de 1 a 3 categorias (tabela obra_categorias, ordem 0 = principal).
// obras.categoria_id segue existindo como a principal, por compatibilidade.
export const MAX_CATEGORIAS = 3;

// Trecho de select do PostgREST para trazer a principal e todas as categorias.
// Usar sempre este trecho ao ler `obras`, para todas as telas verem o mesmo shape.
export const CATEGORIAS_SELECT = 'categorias(nome), obra_categorias(ordem, categoria_id, categorias(nome))';

// Linhas de obra_categorias ordenadas pela `ordem` (principal primeiro).
function linhasOrdenadas(dbBook) {
  return [...(dbBook?.obra_categorias || [])].sort((a, b) => a.ordem - b.ordem);
}

// Nomes das categorias da obra, principal primeiro. Cai para a categoria
// principal de obras.categoria_id se a junção vier vazia.
export function nomesDasCategorias(dbBook) {
  const nomes = linhasOrdenadas(dbBook).map((l) => l.categorias?.nome).filter(Boolean);
  if (nomes.length > 0) return nomes;
  return dbBook?.categorias?.nome ? [dbBook.categorias.nome] : [];
}

// IDs das categorias da obra, principal primeiro (para preencher o formulário).
export function idsDasCategorias(dbBook) {
  const ids = linhasOrdenadas(dbBook).map((l) => l.categoria_id).filter(Boolean);
  if (ids.length > 0) return ids;
  return dbBook?.categoria_id ? [dbBook.categoria_id] : [];
}
