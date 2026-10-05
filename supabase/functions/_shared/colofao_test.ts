// Testes do colofão. Rodar com:
//   deno test --allow-read --allow-env --allow-net supabase/functions/_shared/colofao_test.ts
import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import { PDFDocument, PDFName, PDFString, degrees, PDFDict, PDFArray } from 'npm:pdf-lib@1.17.1'
import JSZip from 'npm:jszip@3.10.1'
import { DOMParser } from 'npm:@xmldom/xmldom@0.8.10'
import { getDocument } from 'npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs'
import { ArquivoRecusado, carimbarEpub, carimbarPdf, formatoDoArquivo, linkVisivel } from './colofao.ts'

const dados = {
  titulo: 'Quanto mais quente o sol de nossas dores',
  autor: 'Érico Ávila',
  link: 'https://artesempreco.com.br/o/3f9a2c1b',
  dataPublicacao: new Date('2026-10-05T15:00:00Z'),
}

// ---------------------------------------------------------------- utilidades

async function pdfLivro(opts: { paginas?: number; tamanho?: [number, number]; rotacao?: number; titulo?: string } = {}) {
  const doc = await PDFDocument.create()
  if (opts.titulo) doc.setTitle(opts.titulo)
  for (let i = 0; i < (opts.paginas ?? 3); i++) {
    const p = doc.addPage(opts.tamanho ?? [420, 595]) // A5
    if (opts.rotacao) p.setRotation(degrees(opts.rotacao))
    p.drawText(`Página ${i + 1}`, { x: 50, y: 500, size: 12 })
  }
  return await doc.save({ useObjectStreams: false })
}

async function textoDaUltimaPagina(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise
  const pagina = await pdf.getPage(pdf.numPages)
  const conteudo = await pagina.getTextContent()
  return conteudo.items.map((i: { str?: string }) => i.str ?? '').join(' ').replace(/\s+/g, ' ')
}

function linksDaPagina(doc: PDFDocument, indice: number): string[] {
  const annots = doc.getPage(indice).node.lookup(PDFName.of('Annots'), PDFArray)
  if (!annots) return []
  return annots.asArray().map((ref) => {
    const a = doc.context.lookup(ref, PDFDict)
    const acao = a.lookup(PDFName.of('A'), PDFDict)
    return (acao.lookup(PDFName.of('URI')) as PDFString).decodeText()
  })
}

function opf3(extraMetadata = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:1</dc:identifier>
    <dc:title>Livro</dc:title>
    <dc:language>pt-BR</dc:language>${extraMetadata}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cap1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cap1"/>
  </spine>
</package>`
}

// EPUB 2 com prefixo opf: e OPF na raiz do zip.
const opf2 = `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Livro 2</dc:title></opf:metadata>
  <opf:manifest><opf:item id="cap1" href="cap1.html" media-type="application/xhtml+xml"/></opf:manifest>
  <opf:spine toc="ncx"><opf:itemref idref="cap1"/></opf:spine>
</opf:package>`

async function epub(opts: { opf?: string; caminhoOpf?: string; extras?: Record<string, string>; mimetype?: string } = {}) {
  const caminhoOpf = opts.caminhoOpf ?? 'OEBPS/content.opf'
  const zip = new JSZip()
  zip.file('mimetype', opts.mimetype ?? 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${caminhoOpf}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  zip.file(caminhoOpf, opts.opf ?? opf3())
  const dir = caminhoOpf.includes('/') ? caminhoOpf.slice(0, caminhoOpf.lastIndexOf('/') + 1) : ''
  zip.file(`${dir}cap1.xhtml`, '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Capítulo</p></body></html>')
  for (const [nome, conteudo] of Object.entries(opts.extras ?? {})) zip.file(nome, conteudo)
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

function xmlBemFormado(xml: string) {
  const erros: string[] = []
  new DOMParser({ errorHandler: { error: (e: string) => erros.push(e), fatalError: (e: string) => erros.push(e) } })
    .parseFromString(xml, 'application/xml')
  assertEquals(erros, [], `XML malformado: ${erros.join('; ')}`)
}

// ---------------------------------------------------------------------- geral

Deno.test('formato e link visível', () => {
  assertEquals(formatoDoArquivo('arquivos/123_livro.PDF'), 'pdf')
  assertEquals(formatoDoArquivo('x.epub'), 'epub')
  assertEquals(formatoDoArquivo('x.mp4'), null)
  assertEquals(linkVisivel('https://artesempreco.com.br/o/abc'), 'artesempreco.com.br/o/abc')
})

// ------------------------------------------------------------------------ PDF

Deno.test('PDF: acrescenta 1 página no tamanho do livro, com texto e link', async () => {
  const original = await pdfLivro({ paginas: 3, tamanho: [420, 595] })
  const final = await carimbarPdf(original, dados)
  const doc = await PDFDocument.load(final)

  assertEquals(doc.getPageCount(), 4)
  const { width, height } = doc.getPage(3).getSize()
  assertEquals([Math.round(width), Math.round(height)], [420, 595])

  const texto = await textoDaUltimaPagina(final)
  assertStringIncludes(texto, dados.titulo)
  assertStringIncludes(texto, 'Érico Ávila')
  assertStringIncludes(texto, 'acesso aberto pelo Arte sem Preço')
  assertStringIncludes(texto, 'artesempreco.com.br/o/3f9a2c1b')
  assertStringIncludes(texto, '90% de cada contribuição vai para quem criou')
  assertStringIncludes(texto, '05/10/2026')
  assert(!/gr[aá]tis/i.test(texto), 'tom editorial: nunca "grátis"')

  assertEquals(linksDaPagina(doc, 3), [dados.link])
  assertEquals(linksDaPagina(doc, 0), [], 'páginas do livro não são tocadas')
})

Deno.test('PDF: metadados completam o vazio e não sobrescrevem os do autor', async () => {
  const semTitulo = await PDFDocument.load(await carimbarPdf(await pdfLivro(), dados))
  assertEquals(semTitulo.getTitle(), dados.titulo)
  assertEquals(semTitulo.getAuthor(), dados.autor)
  assertStringIncludes(semTitulo.getKeywords() ?? '', dados.link)

  const comTitulo = await PDFDocument.load(await carimbarPdf(await pdfLivro({ titulo: 'Título do autor' }), dados))
  assertEquals(comTitulo.getTitle(), 'Título do autor')
})

Deno.test('PDF: página girada gera colofão em pé', async () => {
  const final = await carimbarPdf(await pdfLivro({ tamanho: [595, 420], rotacao: 90 }), dados)
  const doc = await PDFDocument.load(final)
  const { width, height } = doc.getPage(doc.getPageCount() - 1).getSize()
  assertEquals([Math.round(width), Math.round(height)], [420, 595])
})

Deno.test('PDF: caracteres fora da fonte viram "?" em vez de quebrar', async () => {
  const final = await carimbarPdf(await pdfLivro(), { ...dados, titulo: 'Poemas 🌞 e 東京' })
  assertStringIncludes(await textoDaUltimaPagina(final), 'Poemas ? e ??')
})

Deno.test('PDF: título longo quebra em várias linhas sem sair da página', async () => {
  const titulo = 'Um título muito longo que certamente não cabe em uma única linha de um livro de bolso pequeno'
  const final = await carimbarPdf(await pdfLivro({ tamanho: [300, 450] }), { ...dados, titulo })
  assertStringIncludes((await textoDaUltimaPagina(final)).replace(/\s/g, ''), titulo.replace(/\s/g, ''))
})

Deno.test('PDF: protegido por senha é recusado com mensagem para o autor', async () => {
  const bytes = new TextDecoder('latin1').decode(await pdfLivro())
  const cifrado = new Uint8Array([...bytes.replace('trailer\n<<', 'trailer\n<<\n/Encrypt << /Filter /Standard >>')].map((c) => c.charCodeAt(0)))
  const err = await assertRejects(() => carimbarPdf(cifrado, dados), ArquivoRecusado)
  assertStringIncludes(err.message, 'protegido por senha')
})

Deno.test('PDF: assinado digitalmente é recusado', async () => {
  const bytes = new TextDecoder('latin1').decode(await pdfLivro())
  const assinado = new Uint8Array([...bytes.replace('%%EOF', '% /ByteRange [0 10 20 30]\n%%EOF')].map((c) => c.charCodeAt(0)))
  const err = await assertRejects(() => carimbarPdf(assinado, dados), ArquivoRecusado)
  assertStringIncludes(err.message, 'assinatura digital')
})

Deno.test('PDF: arquivo que não é PDF é recusado', async () => {
  await assertRejects(() => carimbarPdf(new TextEncoder().encode('não sou pdf'), dados), ArquivoRecusado)
})

// ----------------------------------------------------------------------- EPUB

async function abrir(bytes: Uint8Array) {
  return await JSZip.loadAsync(bytes)
}

Deno.test('EPUB 3: colofão entra no fim do spine, no manifest e com link', async () => {
  const final = await carimbarEpub(await epub(), dados)
  const zip = await abrir(final)
  const opf = await zip.file('OEBPS/content.opf')!.async('string')
  xmlBemFormado(opf)
  assertStringIncludes(opf, '<item id="asp-colofao" href="asp-colofao.xhtml" media-type="application/xhtml+xml"/>')
  assert(opf.indexOf('idref="cap1"') < opf.indexOf('idref="asp-colofao"'), 'colofão depois do conteúdo')
  assertStringIncludes(opf, `<dc:source>${dados.link}</dc:source>`)

  const xhtml = await zip.file('OEBPS/asp-colofao.xhtml')!.async('string')
  xmlBemFormado(xhtml)
  assertStringIncludes(xhtml, `<a href="${dados.link}">artesempreco.com.br/o/3f9a2c1b</a>`)
  assertStringIncludes(xhtml, 'epub:type="colophon"')
  assertStringIncludes(xhtml, '<!DOCTYPE html>')
  assertStringIncludes(xhtml, 'Érico Ávila')
})

Deno.test('EPUB: "mimetype" continua a 1ª entrada, sem compressão', async () => {
  const final = await carimbarEpub(await epub(), dados)
  const nome = new TextDecoder().decode(final.slice(30, 38))
  const metodo = final[8] | (final[9] << 8)
  assertEquals(nome, 'mimetype')
  assertEquals(metodo, 0, 'STORE')
  assertEquals(new TextDecoder().decode(final.slice(38, 58)), 'application/epub+zip')
})

Deno.test('EPUB 2 com prefixo opf: e OPF na raiz', async () => {
  const final = await carimbarEpub(await epub({ opf: opf2, caminhoOpf: 'content.opf' }), dados)
  const zip = await abrir(final)
  const opf = await zip.file('content.opf')!.async('string')
  xmlBemFormado(opf)
  assertStringIncludes(opf, '<item id="asp-colofao" href="asp-colofao.xhtml"')
  assertStringIncludes(opf, '<itemref idref="asp-colofao" linear="yes"/>\n</opf:spine>')
  const xhtml = await zip.file('asp-colofao.xhtml')!.async('string')
  xmlBemFormado(xhtml)
  assertStringIncludes(xhtml, 'XHTML 1.1')
  assert(!xhtml.includes('epub:type'), 'EPUB 2 não usa epub:type')
})

Deno.test('EPUB: título com & e < é escapado', async () => {
  const final = await carimbarEpub(await epub(), { ...dados, titulo: 'Pão & Circo <ato 1>' })
  const xhtml = await (await abrir(final)).file('OEBPS/asp-colofao.xhtml')!.async('string')
  xmlBemFormado(xhtml)
  assertStringIncludes(xhtml, 'Pão &amp; Circo &lt;ato 1&gt;')
})

Deno.test('EPUB: não colide com arquivo de mesmo nome do autor', async () => {
  const final = await carimbarEpub(await epub({ extras: { 'OEBPS/asp-colofao.xhtml': '<html/>' } }), dados)
  const zip = await abrir(final)
  assertEquals(await zip.file('OEBPS/asp-colofao.xhtml')!.async('string'), '<html/>')
  assert(zip.file('OEBPS/asp-colofao-1.xhtml'))
  assertStringIncludes(await zip.file('OEBPS/content.opf')!.async('string'), 'idref="asp-colofao-1"')
})

Deno.test('EPUB: ofuscação de fonte é aceita; DRM é recusado', async () => {
  const fonte = `<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>`
  await carimbarEpub(await epub({ extras: { 'META-INF/encryption.xml': fonte } }), dados)

  const drm = `<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>`
  const epubDrm = await epub({ extras: { 'META-INF/encryption.xml': drm } })
  const e1 = await assertRejects(() => carimbarEpub(epubDrm, dados), ArquivoRecusado)
  assertStringIncludes(e1.message, 'DRM')

  const epubRights = await epub({ extras: { 'META-INF/rights.xml': '<rights/>' } })
  await assertRejects(() => carimbarEpub(epubRights, dados), ArquivoRecusado)
})

Deno.test('EPUB: mimetype errado ou zip inválido são recusados', async () => {
  await assertRejects(async () => carimbarEpub(await epub({ mimetype: 'application/zip' }), dados), ArquivoRecusado)
  await assertRejects(() => carimbarEpub(new TextEncoder().encode('não sou zip'), dados), ArquivoRecusado)
})
