// ============================================================================
// gerar_arquivo_final — monta o arquivo distribuído da obra (com colofão)
//
// Chamada pelo Painel do Autor logo depois do upload do arquivo original:
//   POST { obra_id, caminho_original }   (caminho dentro do bucket "obras")
//
// Para PDF/EPUB acrescenta a página final de créditos (ver _shared/colofao.ts)
// e grava a cópia em finais/<obra_id>/; outros formatos seguem como vieram.
// Atualiza obras.arquivo_url (distribuído) e obras.arquivo_original_url.
//
// Princípios:
//  - Age como o próprio autor (JWT dele): RLS garante que só mexe na obra
//    dele e só grava no storage com as permissões dele.
//  - Arquivo recusado (senha, DRM, assinatura) -> 422 com mensagem pronta
//    para o autor; nada é alterado na obra.
//  - Modo de reprocessamento (todas as obras), para aplicar o colofão às obras
//    antigas ou depois de mudar o texto: exige o segredo COLOFAO_ADMIN_SECRET
//    no header x-colofao-admin. Sem o segredo configurado, o modo não existe.
// ============================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ArquivoRecusado, carimbar, formatoDoArquivo } from '../_shared/colofao.ts'

const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '')
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? SITE_URL)
  .split(',').map(s => s.trim()).filter(Boolean)
const ADMIN_SECRET = Deno.env.get('COLOFAO_ADMIN_SECRET') ?? ''

const BUCKET = 'obras'
// Acima disso o processamento arrisca estourar a memória da função: a obra é
// publicada sem colofão e o painel avisa o autor.
const LIMITE_COLOFAO_BYTES = 50 * 1024 * 1024
const TIPOS: Record<string, string> = { pdf: 'application/pdf', epub: 'application/epub+zip' }

function corsHeaders(origin: string | null) {
  const allow = ALLOWED_ORIGINS.length === 0
    ? (origin ?? '*')
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function caminhoValido(caminho: unknown): caminho is string {
  return typeof caminho === 'string'
    && caminho.startsWith('arquivos/')
    && !caminho.includes('..')
    && caminho.length < 512
}

// ".../storage/v1/object/public/obras/<caminho>" -> "<caminho>"
function caminhoDaUrl(url: string | null): string | null {
  if (!url) return null
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marca)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marca.length).split('?')[0])
}

function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface Resultado {
  arquivo_url: string
  colofao: boolean
  aviso?: string
}

async function processarObra(db: SupabaseClient, obraId: string, caminhoOriginal: string): Promise<Resultado> {
  const { data: obra, error } = await db
    .from('obras')
    .select('id, titulo, autor_id, created_at, arquivo_url, usuarios(nome), links_obra(codigo)')
    .eq('id', obraId)
    .maybeSingle()
  if (error) throw new Error(`Erro ao ler a obra: ${error.message}`)
  if (!obra) throw new ArquivoRecusado('Obra não encontrada ou sem permissão.')

  // O embed 1:1 pode vir como objeto ou lista, conforme a versão do PostgREST.
  const link = Array.isArray(obra.links_obra) ? obra.links_obra[0] : obra.links_obra
  const autor = Array.isArray(obra.usuarios) ? obra.usuarios[0] : obra.usuarios
  if (!link?.codigo) throw new Error('Obra sem link curto (links_obra).')

  const storage = db.storage.from(BUCKET)
  const urlOriginal = storage.getPublicUrl(caminhoOriginal).data.publicUrl
  const formato = formatoDoArquivo(caminhoOriginal)

  let urlFinal = urlOriginal
  let colofao = false
  let aviso: string | undefined

  if (formato) {
    const { data: blob, error: dlError } = await storage.download(caminhoOriginal)
    if (dlError || !blob) throw new Error(`Erro ao baixar o original: ${dlError?.message}`)

    if (blob.size > LIMITE_COLOFAO_BYTES) {
      aviso = 'O arquivo é grande demais para receber a página de créditos automaticamente; ele foi publicado como enviado.'
    } else {
      const final = await carimbar(formato, new Uint8Array(await blob.arrayBuffer()), {
        titulo: obra.titulo,
        autor: autor?.nome || 'Autor',
        link: `${SITE_URL}/o/${link.codigo}`,
        dataPublicacao: new Date(obra.created_at),
      })
      const nome = caminhoOriginal.split('/').pop()!.replace(/^\d+_/, '')
      const caminhoFinal = `finais/${obra.id}/${Date.now()}_${nome}`
      const { error: upError } = await storage.upload(caminhoFinal, final, {
        contentType: TIPOS[formato],
        cacheControl: '3600',
        upsert: false,
      })
      if (upError) throw new Error(`Erro ao gravar o arquivo final: ${upError.message}`)
      urlFinal = storage.getPublicUrl(caminhoFinal).data.publicUrl
      colofao = true
    }
  }

  const caminhoFinalAnterior = caminhoDaUrl(obra.arquivo_url)
  const { error: updError } = await db
    .from('obras')
    .update({ arquivo_url: urlFinal, arquivo_original_url: urlOriginal })
    .eq('id', obra.id)
  if (updError) throw new Error(`Erro ao atualizar a obra: ${updError.message}`)

  // Limpeza best-effort da versão final anterior (só a pasta finais/ da obra).
  if (caminhoFinalAnterior?.startsWith(`finais/${obra.id}/`) && caminhoFinalAnterior !== caminhoDaUrl(urlFinal)) {
    await storage.remove([caminhoFinalAnterior]).catch(() => {})
  }

  return { arquivo_url: urlFinal, colofao, aviso }
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'))
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey || !SITE_URL) {
    // Sem SITE_URL o link impresso no colofão sairia quebrado: melhor falhar.
    console.error('Configuração ausente (SUPABASE_* ou SITE_URL).')
    return json({ error: 'Erro de configuração do servidor.' }, 500)
  }

  const body = await req.json().catch(() => ({}))

  try {
    // -----------------------------------------------------------------------
    // Modo reprocessamento (administrativo)
    // -----------------------------------------------------------------------
    const segredo = req.headers.get('x-colofao-admin') ?? ''
    if (segredo) {
      if (!ADMIN_SECRET || !iguaisEmTempoConstante(segredo, ADMIN_SECRET)) {
        return json({ error: 'Não autorizado.' }, 401)
      }
      const admin = createClient(supabaseUrl, serviceKey)
      const { data: obras, error } = await admin
        .from('obras')
        .select('id, arquivo_original_url')
        .not('arquivo_original_url', 'is', null)
      if (error) throw new Error(error.message)

      const resultados = []
      for (const o of obras ?? []) {
        const caminho = caminhoDaUrl(o.arquivo_original_url)
        if (!caminho) {
          resultados.push({ obra_id: o.id, erro: 'arquivo_original_url fora do bucket' })
          continue
        }
        try {
          resultados.push({ obra_id: o.id, ...(await processarObra(admin, o.id, caminho)) })
        } catch (err) {
          resultados.push({ obra_id: o.id, erro: (err as Error).message })
        }
      }
      return json({ resultados })
    }

    // -----------------------------------------------------------------------
    // Modo normal: o autor logado, para a obra dele
    // -----------------------------------------------------------------------
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'É necessário estar logado.' }, 401)

    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userError } = await db.auth.getUser()
    if (userError || !userData?.user) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401)

    const obraId = body?.obra_id
    const caminhoOriginal = body?.caminho_original
    if (typeof obraId !== 'string' || !caminhoValido(caminhoOriginal)) {
      return json({ error: 'Parâmetros inválidos.' }, 400)
    }

    // A leitura é pública; a posse é conferida aqui e de novo pela RLS no update.
    const { data: dona } = await db.from('obras').select('autor_id').eq('id', obraId).maybeSingle()
    if (!dona || dona.autor_id !== userData.user.id) {
      return json({ error: 'Obra não encontrada ou sem permissão.' }, 403)
    }

    return json(await processarObra(db, obraId, caminhoOriginal))
  } catch (err) {
    if (err instanceof ArquivoRecusado) return json({ error: err.message }, 422)
    console.error('[gerar_arquivo_final]', err)
    return json({ error: 'Erro ao preparar o arquivo da obra.' }, 500)
  }
})
