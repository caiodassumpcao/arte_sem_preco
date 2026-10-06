// ============================================================================
// verificar_pagamento — consulta ativa do pagamento no Mercado Pago
//
// A tela de sucesso chama esta função enquanto a contribuição está pendente:
//   POST { request_id }
//
// Não depende da notificação (webhook) chegar: procura no MP o pagamento cujo
// external_reference é o request_id e grava o resultado na transação, com as
// mesmas regras do webhook (_shared/pagamento_mp.ts).
//
// Princípios:
//  - Só o dono da transação consulta (identidade vem do JWT).
//  - Transação que já saiu de "pendente" não gera chamada ao MP.
// ============================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { MercadoPagoConfig, Payment } from 'npm:mercadopago'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { aplicarNaTransacao, escolherPagamento, type PagamentoMp } from '../_shared/pagamento_mp.ts'

const SITE_URL = Deno.env.get('SITE_URL') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? SITE_URL)
  .split(',').map(s => s.trim()).filter(Boolean)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  if (!supabaseUrl || !anonKey || !serviceKey || !accessToken) {
    console.error('Configuração ausente (SUPABASE_* ou MERCADOPAGO_ACCESS_TOKEN).')
    return json({ error: 'Erro de configuração do servidor.' }, 500)
  }

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'É necessário estar logado.' }, 401)

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser()
    if (userError || !userData?.user) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401)

    const body = await req.json().catch(() => ({}))
    const requestId = body?.request_id
    if (typeof requestId !== 'string' || !UUID.test(requestId)) {
      return json({ error: 'request_id inválido.' }, 400)
    }

    const supabase = createClient(supabaseUrl, serviceKey)
    const { data: transacao, error } = await supabase
      .from('transacoes')
      .select('status, valor_pago, usuario_id')
      .eq('request_id', requestId)
      .maybeSingle()
    if (error) throw error
    if (!transacao || transacao.usuario_id !== userData.user.id) {
      return json({ error: 'Pagamento não encontrado.' }, 404)
    }

    if (transacao.status !== 'pendente') {
      return json({ status: transacao.status, valor_pago: Number(transacao.valor_pago) })
    }

    // Procura no MP pelo request_id (é o external_reference da preferência).
    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } })
    const busca = await new Payment(client).search({
      options: { external_reference: requestId, sort: 'date_created', criteria: 'desc' },
    })
    const pagamento = escolherPagamento((busca?.results ?? []) as PagamentoMp[])

    if (!pagamento) {
      // Ainda não existe pagamento no MP: a pessoa não concluiu o checkout.
      return json({ status: 'pendente', valor_pago: Number(transacao.valor_pago), pagamento_iniciado: false })
    }

    const resultado = await aplicarNaTransacao(supabase, requestId, pagamento)
    if (resultado?.linhas) {
      console.log(`verificar_pagamento: ${pagamento.id} -> ${resultado.status} (request_id: ${requestId})`)
    }

    const { data: atualizada } = await supabase
      .from('transacoes')
      .select('status, valor_pago')
      .eq('request_id', requestId)
      .maybeSingle()

    return json({
      status: atualizada?.status ?? transacao.status,
      valor_pago: Number(atualizada?.valor_pago ?? transacao.valor_pago),
      pagamento_iniciado: true,
    })
  } catch (err) {
    console.error('[verificar_pagamento]', err)
    return json({ error: 'Não foi possível verificar o pagamento agora.' }, 502)
  }
})
