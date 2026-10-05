// ============================================================================
// Colofão — página final de créditos acrescentada às obras (PDF e EPUB).
//
// Módulo puro: recebe os bytes do arquivo do autor e devolve os bytes do
// arquivo final. Não fala com banco nem storage, para poder ser testado
// isoladamente (colofao_test.ts) e reaproveitado pela Edge Function.
//
// Decisões de design:
//  - Discreto, com cara de colofão de livro: tipografia serifada pequena,
//    centralizada, no fim da obra. Nada de banner, logo ou QR code.
//  - Link clicável e curto, digitável à mão (quem lê no celular não escaneia
//    a própria tela).
//  - Metadados do arquivo recebem o link também: sobrevivem em muitos casos
//    em que a página é apagada. Nunca sobrescrevem título/autor do autor.
// ============================================================================
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont } from 'npm:pdf-lib@1.17.1'
import JSZip from 'npm:jszip@3.10.1'

export interface DadosColofao {
  titulo: string
  autor: string
  /** URL completa do link curto, ex.: https://artesempreco.com.br/o/3f9a2c1b */
  link: string
  dataPublicacao: Date
}

/** Erro com mensagem pronta para mostrar ao autor (vira HTTP 422). */
export class ArquivoRecusado extends Error {}

export type Formato = 'pdf' | 'epub'

export function formatoDoArquivo(nomeOuCaminho: string): Formato | null {
  const ext = nomeOuCaminho.toLowerCase().split('?')[0].split('.').pop()
  return ext === 'pdf' || ext === 'epub' ? ext : null
}

// O link aparece sem "https://" para ficar curto e fácil de digitar.
export function linkVisivel(link: string): string {
  return link.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function dataBr(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// Texto único para PDF e EPUB. Tom editorial do projeto: "acesso aberto",
// nunca "grátis"; valoriza quem criou.
export function textoColofao(d: DadosColofao) {
  return {
    titulo: d.titulo.trim(),
    autor: d.autor.trim(),
    convite: [
      'Esta obra circula em acesso aberto pelo Arte sem Preço.',
      'Se ela chegou até você, conheça quem a criou e contribua com o valor que puder, quando puder:',
    ],
    link: linkVisivel(d.link),
    divisao: '90% de cada contribuição vai para quem criou; 10% mantém a plataforma.',
    rodape: `Publicado no Arte sem Preço em ${dataBr(d.dataPublicacao)}.`,
  }
}

// ----------------------------------------------------------------------------
// PDF
// ----------------------------------------------------------------------------

// As fontes padrão do PDF só cobrem WinAnsi (português inteiro cabe nele).
// Qualquer caractere fora disso (emoji, CJK...) vira "?" em vez de quebrar.
function textoSeguro(font: PDFFont, texto: string): string {
  let saida = ''
  for (const ch of texto.normalize('NFC')) {
    try {
      font.encodeText(ch)
      saida += ch
    } catch {
      saida += '?'
    }
  }
  return saida
}

function quebrarLinhas(font: PDFFont, texto: string, tamanho: number, larguraMax: number): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (atual && font.widthOfTextAtSize(tentativa, tamanho) > larguraMax) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = tentativa
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

// Busca de bytes simples: decodificar um PDF grande inteiro como string
// estouraria a memória da Edge Function.
function contemBytes(bytes: Uint8Array, padrao: string): boolean {
  const alvo = new TextEncoder().encode(padrao)
  const primeiro = alvo[0]
  for (let i = bytes.indexOf(primeiro); i !== -1 && i <= bytes.length - alvo.length; i = bytes.indexOf(primeiro, i + 1)) {
    let j = 1
    while (j < alvo.length && bytes[i + j] === alvo[j]) j++
    if (j === alvo.length) return true
  }
  return false
}

function pdfAssinado(bytes: Uint8Array): boolean {
  // Assinaturas digitais usam /ByteRange; acrescentar uma página as invalida.
  return contemBytes(bytes, '/ByteRange')
}

export async function carimbarPdf(bytes: Uint8Array, dados: DadosColofao): Promise<Uint8Array> {
  if (pdfAssinado(bytes)) {
    throw new ArquivoRecusado(
      'Este PDF tem assinatura digital, que seria invalidada pela página de créditos. Envie uma versão sem assinatura.',
    )
  }

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (err) {
    if ((err as Error)?.name === 'EncryptedPDFError' || /encrypt/i.test(String((err as Error)?.message))) {
      throw new ArquivoRecusado('Este PDF está protegido por senha. Envie uma versão sem proteção.')
    }
    throw new ArquivoRecusado('Não foi possível ler este PDF. Verifique se o arquivo não está corrompido.')
  }

  if (doc.getPageCount() === 0) {
    throw new ArquivoRecusado('Este PDF não tem páginas.')
  }

  // A página nova segue o tamanho da última página do livro (já considerando
  // rotação), para não destoar do miolo.
  const ultima = doc.getPage(doc.getPageCount() - 1)
  const { width: w0, height: h0 } = ultima.getSize()
  const girada = ultima.getRotation().angle % 180 !== 0
  const largura = girada ? h0 : w0
  const altura = girada ? w0 : h0

  const pagina = doc.addPage([largura, altura])
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const italico = await doc.embedFont(StandardFonts.TimesRomanItalic)
  const t = textoColofao(dados)

  const corpo = Math.min(10.5, Math.max(7.5, largura * 0.02))
  const entrelinha = corpo * 1.45
  const larguraTexto = largura * 0.6
  const cinza = rgb(0.25, 0.25, 0.25)
  const cinzaClaro = rgb(0.45, 0.45, 0.45)
  const corLink = rgb(0.76, 0.31, 0.2) // --primary do site (#c25032)

  type Linha = { texto: string; font: PDFFont; tamanho: number; cor: ReturnType<typeof rgb>; link?: string }
  const blocos: (Linha | 'espaco')[] = []
  const adicionar = (texto: string, font: PDFFont, tamanho: number, cor = cinza, link?: string) => {
    for (const l of quebrarLinhas(font, textoSeguro(font, texto), tamanho, larguraTexto)) {
      blocos.push({ texto: l, font, tamanho, cor, link })
    }
  }

  adicionar(t.titulo, italico, corpo * 1.15)
  adicionar(t.autor, serif, corpo)
  blocos.push('espaco')
  for (const p of t.convite) adicionar(p, serif, corpo)
  blocos.push('espaco')
  adicionar(t.link, serif, corpo * 1.05, corLink, dados.link)
  blocos.push('espaco')
  adicionar(t.divisao, serif, corpo * 0.9, cinzaClaro)
  adicionar(t.rodape, serif, corpo * 0.9, cinzaClaro)

  const alturaBloco = blocos.reduce((s, b) => s + (b === 'espaco' ? entrelinha * 0.8 : entrelinha), 0)
  // Bloco centrado na metade inferior, como um colofão tradicional.
  let y = altura * 0.42 + alturaBloco / 2

  // Fio fino acima do bloco.
  const fio = largura * 0.08
  pagina.drawLine({
    start: { x: largura / 2 - fio / 2, y: y + entrelinha * 0.6 },
    end: { x: largura / 2 + fio / 2, y: y + entrelinha * 0.6 },
    thickness: 0.4,
    color: cinzaClaro,
  })

  for (const b of blocos) {
    if (b === 'espaco') {
      y -= entrelinha * 0.8
      continue
    }
    y -= entrelinha
    const larguraLinha = b.font.widthOfTextAtSize(b.texto, b.tamanho)
    const x = (largura - larguraLinha) / 2
    pagina.drawText(b.texto, { x, y, size: b.tamanho, font: b.font, color: b.cor })

    if (b.link) {
      pagina.drawLine({
        start: { x, y: y - 1.5 },
        end: { x: x + larguraLinha, y: y - 1.5 },
        thickness: 0.4,
        color: b.cor,
      })
      // Anotação de link: a área clicável cobre a linha do endereço.
      const anotacao = doc.context.register(
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [x - 2, y - 4, x + larguraLinha + 2, y + b.tamanho + 2],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(b.link) },
        }),
      )
      pagina.node.addAnnot(anotacao)
    }
  }

  // Metadados: completa o que estiver vazio, nunca sobrescreve o do autor.
  if (!doc.getTitle()) doc.setTitle(dados.titulo)
  if (!doc.getAuthor()) doc.setAuthor(dados.autor)
  if (!doc.getSubject()) doc.setSubject(`Acesso aberto pelo Arte sem Preço: ${dados.link}`)
  const palavras = doc.getKeywords()
  if (!palavras || !palavras.includes(dados.link)) {
    doc.setKeywords([...(palavras ? [palavras] : []), 'Arte sem Preço', dados.link])
  }

  return await doc.save()
}

// ----------------------------------------------------------------------------
// EPUB
// ----------------------------------------------------------------------------

function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xhtmlColofao(dados: DadosColofao, epub3: boolean): string {
  const t = textoColofao(dados)
  const doctype = epub3
    ? '<!DOCTYPE html>'
    : '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">'
  const sectionAttrs = epub3 ? ' epub:type="colophon"' : ''
  const nsEpub = epub3 ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
${doctype}
<html xmlns="http://www.w3.org/1999/xhtml"${nsEpub} xml:lang="pt-BR" lang="pt-BR">
<head>
<title>Colofão</title>
<style type="text/css">
  .asp-colofao { margin: 30% auto 0; max-width: 28em; text-align: center; font-size: 0.85em; line-height: 1.5; }
  .asp-colofao p { margin: 0 0 0.9em; text-indent: 0; }
  .asp-colofao .asp-titulo { font-style: italic; margin-bottom: 0.1em; }
  .asp-colofao .asp-fio { width: 3em; margin: 0 auto 1.5em; border: 0; border-top: 1px solid #999; }
  .asp-colofao .asp-nota { font-size: 0.9em; color: #666; }
</style>
</head>
<body>
<section class="asp-colofao"${sectionAttrs}>
<hr class="asp-fio" />
<p class="asp-titulo">${escaparXml(t.titulo)}</p>
<p>${escaparXml(t.autor)}</p>
<p>${t.convite.map(escaparXml).join(' ')}</p>
<p><a href="${escaparXml(dados.link)}">${escaparXml(t.link)}</a></p>
<p class="asp-nota">${escaparXml(t.divisao)}<br />${escaparXml(t.rodape)}</p>
</section>
</body>
</html>
`
}

// Algoritmos de encryption.xml que são só ofuscação de fontes (permitidos);
// qualquer outro indica DRM, e aí não dá para mexer no arquivo.
const OFUSCACAO_DE_FONTE = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']

function caminhoRelativo(dirOpf: string, arquivo: string): string {
  return dirOpf ? `${dirOpf}/${arquivo}` : arquivo
}

export async function carimbarEpub(bytes: Uint8Array, dados: DadosColofao): Promise<Uint8Array> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new ArquivoRecusado('Não foi possível ler este EPUB. Verifique se o arquivo não está corrompido.')
  }

  const mimetype = await zip.file('mimetype')?.async('string')
  if (mimetype?.trim() !== 'application/epub+zip') {
    throw new ArquivoRecusado('Este arquivo não é um EPUB válido.')
  }

  if (zip.file('META-INF/rights.xml')) {
    throw new ArquivoRecusado('Este EPUB tem proteção (DRM). Envie uma versão sem proteção.')
  }
  const encryption = await zip.file('META-INF/encryption.xml')?.async('string')
  if (encryption) {
    const algoritmos = [...encryption.matchAll(/Algorithm="([^"]+)"/g)].map((m) => m[1])
    if (algoritmos.some((a) => !OFUSCACAO_DE_FONTE.includes(a))) {
      throw new ArquivoRecusado('Este EPUB tem proteção (DRM). Envie uma versão sem proteção.')
    }
  }

  const container = await zip.file('META-INF/container.xml')?.async('string')
  const caminhoOpf = container?.match(/full-path="([^"]+)"/)?.[1]
  const opfOriginal = caminhoOpf ? await zip.file(caminhoOpf)?.async('string') : undefined
  if (!caminhoOpf || !opfOriginal) {
    throw new ArquivoRecusado('Este EPUB está incompleto (não foi encontrado o arquivo de pacote).')
  }

  const epub3 = /<(?:\w+:)?package[^>]*\bversion="3/.test(opfOriginal)
  const dirOpf = caminhoOpf.includes('/') ? caminhoOpf.slice(0, caminhoOpf.lastIndexOf('/')) : ''

  // Nome e id que não colidam com nada que o autor já tenha no pacote.
  let sufixo = ''
  for (let i = 1; zip.file(caminhoRelativo(dirOpf, `asp-colofao${sufixo}.xhtml`)) || opfOriginal.includes(`id="asp-colofao${sufixo}"`); i++) {
    sufixo = `-${i}`
  }
  const nomeArquivo = `asp-colofao${sufixo}.xhtml`
  const idItem = `asp-colofao${sufixo}`

  const fechamento = (tag: string) => new RegExp(`</((?:\\w+:)?${tag})>`)
  const inserirAntes = (xml: string, tag: string, trecho: string) => {
    const re = fechamento(tag)
    if (!re.test(xml)) throw new ArquivoRecusado(`Este EPUB está incompleto (sem <${tag}>).`)
    return xml.replace(re, (m) => `${trecho}\n${m}`)
  }

  let opf = opfOriginal
  opf = inserirAntes(opf, 'manifest', `<item id="${idItem}" href="${nomeArquivo}" media-type="application/xhtml+xml"/>`)
  opf = inserirAntes(opf, 'spine', `<itemref idref="${idItem}" linear="yes"/>`)
  // dc:source com o link, só se o pacote já declara o namespace Dublin Core.
  const prefixoDc = opf.match(/xmlns:(\w+)="http:\/\/purl\.org\/dc\/elements\/1\.1\/"/)?.[1]
  if (prefixoDc && fechamento('metadata').test(opf) && !opf.includes(dados.link)) {
    opf = inserirAntes(opf, 'metadata', `<${prefixoDc}:source>${escaparXml(dados.link)}</${prefixoDc}:source>`)
  }

  // Reempacota: "mimetype" precisa ser a primeira entrada e sem compressão.
  const saida = new JSZip()
  saida.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  for (const [nome, entrada] of Object.entries(zip.files)) {
    if (nome === 'mimetype') continue
    if (entrada.dir) {
      saida.folder(nome)
    } else if (nome === caminhoOpf) {
      saida.file(nome, opf)
    } else {
      saida.file(nome, await entrada.async('uint8array'))
    }
  }
  saida.file(caminhoRelativo(dirOpf, nomeArquivo), xhtmlColofao(dados, epub3))

  return await saida.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/epub+zip',
  })
}

export async function carimbar(formato: Formato, bytes: Uint8Array, dados: DadosColofao): Promise<Uint8Array> {
  return formato === 'pdf' ? carimbarPdf(bytes, dados) : carimbarEpub(bytes, dados)
}
