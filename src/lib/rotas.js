// Catálogo filtrado pelas obras de um autor. O filtro é pelo id (exato);
// o nome vai junto só para o selo "Exibindo obras de: ..." no catálogo.
export function catalogoDoAutor(autorId, nome) {
  const params = new URLSearchParams({ autor_id: autorId });
  if (nome) params.set('autor', nome);
  return `/catalogo?${params}`;
}
