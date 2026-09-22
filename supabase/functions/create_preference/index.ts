// ============================================================================
// create_preference — cria a preferência de pagamento no Mercado Pago
//
// Princípios:
//  - Nunca confia em dados do cliente: valida o JWT e lê a obra no banco.
//  - Grava uma transação 'pendente' ANTES de redirecionar, para que o webhook
//    tenha uma linha para atualizar e a tela de sucesso tenha o que consultar.
//  - Idempotente por request_id.
// ============================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { MercadoPagoConfig, Preference } from 'npm:mercadopago'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE_URL = Deno.env.get('SITE_URL') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? SITE_URL)
  .split(',').map(s => s.trim()).filter(Boolean)

const VALOR_MAXIMO = 10_000
const SPLIT_AUTOR = 0.9

function corsHeaders(origin: string | null) {
  // Em dev (sem ALLOWED_ORIGINS configurado) libera localhost.
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

  try {
    // ---------------------------------------------------------------------
    // 1. Autenticação — a identidade vem do JWT, nunca do body
    // ---------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return json({ error: 'É necessário estar logado para contribuir.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error('Credenciais do Supabase ausentes no ambiente.')
      return json({ error: 'Erro de configuração do servidor.' }, 500)
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser()
    if (userError || !userData?.user) {
      return json({ error: 'Sessão inválida. Faça login novamente.' }, 401)
    }
    const userId = userData.user.id

    // ---------------------------------------------------------------------
    // 2. Entrada
    // ---------------------------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const obraId = body?.obra_id
    const valorBruto = Number(body?.valor)
    const metodo = body?.metodo === 'pix' || body?.metodo === 'cartao' ? body.metodo : null

    if (!obraId || typeof obraId !== 'string') {
      return json({ error: 'obra_id é obrigatório.' }, 400)
    }
    if (!Number.isFinite(valorBruto) || valorBruto <= 0) {
      return json({ error: 'Valor da contribuição deve ser maior que zero.' }, 400)
    }
    if (valorBruto > VALOR_MAXIMO) {
      return json({ error: `Valor máximo por contribuição: R$ ${VALOR_MAXIMO}.` }, 400)
    }
    const valor = Math.round(valorBruto * 100) / 100

    // ---------------------------------------------------------------------
    // 3. A obra é lida do banco — título e autor não vêm do cliente
    // ---------------------------------------------------------------------
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: obra, error: obraError } = await supabase
      .from('obras')
      .select('id, titulo, autor_id')
      .eq('id', obraId)
      .maybeSingle()

    if (obraError) {
      console.error('Erro ao buscar obra:', obraError)
      return json({ error: 'Erro ao consultar a obra.' }, 500)
    }
    if (!obra) {
      return json({ error: 'Obra não encontrada.' }, 404)
    }

    // ---------------------------------------------------------------------
    // 4. Mercado Pago
    // ---------------------------------------------------------------------
    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) {
      console.error('MERCADOPAGO_ACCESS_TOKEN não definido.')
      return json({ error: 'Gateway de pagamento não configurado.' }, 500)
    }

    // auto_return exige back_urls HTTPS. Sem SITE_URL válida, falhar explícito.
    const isHttps = SITE_URL.startsWith('https://')
    const isLocal = SITE_URL.startsWith('http://localhost') || SITE_URL.startsWith('http://127.0.0.1')
    if (!SITE_URL || (!isHttps && !isLocal)) {
      console.error(`SITE_URL inválida: "${SITE_URL}"`)
      return json({ error: 'SITE_URL não configurada corretamente no servidor.' }, 500)
    }

    const requestId = crypto.randomUUID()

    // ---------------------------------------------------------------------
    // 5. Transação 'pendente' gravada ANTES do redirecionamento
    // ---------------------------------------------------------------------
    const { error: pendingError } = await supabase
      .from('transacoes')
      .insert({
        usuario_id: userId,
        obra_id: obra.id,
        valor_pago: valor,
        status: 'pendente',
        request_id: requestId,
        gateway: 'mercadopago',
        valor_autor: Math.round(valor * SPLIT_AUTOR * 100) / 100,
        valor_plataforma: Math.round(valor * (1 - SPLIT_AUTOR) * 100) / 100,
        status_repasse: 'pendente',
      })

    if (pendingError) {
      console.error('Erro ao criar transação pendente:', pendingError)
      return json({ error: 'Não foi possível iniciar o pagamento.' }, 500)
    }

    const client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 8000, idempotencyKey: requestId },
    })
    const preference = new Preference(client)

    const backBase = `${SITE_URL}/sucesso?request_id=${requestId}&obra_id=${obra.id}`

    const response = await preference.create({
      body: {
        items: [{
          id: obra.id,
          title: `Contribuição - ${obra.titulo}`,
          quantity: 1,
          unit_price: valor,
          currency_id: 'BRL',
        }],
        // Sem payer.email o checkout hospedado do MP pode travar na etapa de
        // revisão do cartão (botão "Pagar" não aparece).
        payer: { email: userData.user.email },
        // external_reference é o campo que o MP sempre devolve no webhook
        external_reference: requestId,
        metadata: {
          obra_id: obra.id,
          user_id: userId,
          request_id: requestId,
        },
        notification_url: `${supabaseUrl}/functions/v1/webhook_mercadopago`,
        back_urls: {
          success: backBase,
          pending: `${backBase}&status=pending`,
          failure: `${SITE_URL}/obra/${obra.id}?error=payment_failed`,
        },
        auto_return: 'approved',
        payment_methods: {
          // Sem boleto no MVP. A aba escolhida na tela de contribuição
          // restringe o método pra evitar o usuário cair na lista genérica
          // do Checkout Pro — 'pix' força só Pix, 'cartao' exclui Pix/boleto.
          excluded_payment_types: metodo === 'pix'
            ? [{ id: 'ticket' }, { id: 'atm' }, { id: 'credit_card' }, { id: 'debit_card' }, { id: 'prepaid_card' }]
            : metodo === 'cartao'
              ? [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }]
              : [{ id: 'ticket' }],
          installments: 1,
        },
      },
    })

    if (!response?.init_point) {
      console.error('MP não retornou init_point:', response)
      await supabase.from('transacoes')
        .update({ status: 'falhou' })
        .eq('request_id', requestId)
      return json({ error: 'Gateway não retornou link de pagamento.' }, 502)
    }

    return json({
      id: response.id,
      init_point: response.init_point,
      request_id: requestId,
    })
  } catch (error) {
    console.error('Erro ao criar preferência:', error)
    return json({ error: 'Erro inesperado ao gerar o pagamento.' }, 500)
  }
})
