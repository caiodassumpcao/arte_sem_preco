// ============================================================================
// webhook_mercadopago — confirma o pagamento e atualiza a transação
//
// Deploy OBRIGATÓRIO com --no-verify-jwt (o MP não envia JWT do Supabase).
// Por isso a validação de x-signature abaixo é a única barreira do endpoint.
//
// Princípios:
//  - Nunca confia no conteúdo da notificação: reconsulta a API do MP. Por
//    isso uma notificação forjada ou repetida não tem efeito além de uma
//    consulta ao MP.
//  - O MP manda cada evento em DOIS formatos para a notification_url:
//      Webhook (novo):  {"type":"payment","data":{"id":...}} + x-signature
//      IPN (legado):    {"topic":"payment","resource":...} / ?topic=&id=, SEM
//                       assinatura válida
//    O Webhook exige x-signature (HMAC-SHA256, MERCADOPAGO_WEBHOOK_SECRET).
//    O IPN é aceito sem assinatura e confirmado na API — antes era recusado
//    com 401 e o MP o reenviava por dias.
//  - Idempotente: UPDATE por request_id, com upsert por gateway_id.
//  - Sempre registra o evento em webhook_eventos para reconciliação.
//  - Retorna 200 para o que não deve ser reprocessado; 5xx só em falha
//    transitória real (aí o MP faz retry).
// ============================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { MercadoPagoConfig, Payment } from 'npm:mercadopago'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { aplicarNaTransacao, dadosDaTransacao, type PagamentoMp } from '../_shared/pagamento_mp.ts'

// ---------------------------------------------------------------------------
// Validação da assinatura do Mercado Pago
// Template: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// ---------------------------------------------------------------------------
async function validarAssinatura(
  signatureHeader: string | null,
  requestIdHeader: string | null,
  dataId: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !dataId) return false

  const partes = Object.fromEntries(
    signatureHeader.split(',').map(p => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const ts = partes['ts']
  const v1 = partes['v1']
  if (!ts || !v1) return false

  // Sem janela de tempo: o MP reenvia a mesma notificação (mesmo ts) por horas
  // quando não recebe 200, e uma janela de 10 min recusava esses reenvios.
  // Repetir uma notificação válida é inofensivo — o pagamento é reconsultado
  // na API e a gravação é idempotente.

  const manifest =
    `id:${dataId.toLowerCase()};` +
    (requestIdHeader ? `request-id:${requestIdHeader};` : '') +
    `ts:${ts};`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const calculado = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Comparação em tempo constante
  if (calculado.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < calculado.length; i++) {
    diff |= calculado.charCodeAt(i) ^ v1.charCodeAt(i)
  }
  return diff === 0
}

async function registrarEvento(
  supabase: SupabaseClient,
  campos: Record<string, unknown>,
) {
  const { error } = await supabase.from('webhook_eventos').insert(campos)
  if (error) console.error('Falha ao registrar webhook_eventos:', error.message)
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('Credenciais do Supabase ausentes.')
    return new Response('Config error', { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(req.url)
    const rawBody = await req.text()
    let payload: Record<string, any> = {}
    try { payload = rawBody ? JSON.parse(rawBody) : {} } catch { /* body vazio ou não-JSON */ }

    // IPN (legado) usa "topic"; Webhook (novo) usa "type".
    const topicoIpn = url.searchParams.get('topic') || payload?.topic || null
    const ehIpn = !!topicoIpn

    // No IPN, "resource" pode ser só o id ou uma URL terminando no id.
    const idDoResource = typeof payload?.resource === 'string'
      ? payload.resource.match(/(\d+)\/?$/)?.[1] ?? null
      : null

    const paymentId =
      url.searchParams.get('data.id') ||
      url.searchParams.get('id') ||
      payload?.data?.id?.toString() ||
      idDoResource ||
      null

    const eventoTipo = payload?.type || topicoIpn || url.searchParams.get('type') || null

    // -------------------------------------------------------------------
    // 1. Assinatura (só no formato Webhook; o IPN não é assinado)
    // -------------------------------------------------------------------
    let assinaturaOk = false
    if (!ehIpn) {
      const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')
      if (!secret) {
        console.error('MERCADOPAGO_WEBHOOK_SECRET não definido — recusando notificação.')
        await registrarEvento(supabase, {
          evento_tipo: eventoTipo, payment_id: paymentId, assinatura_ok: false,
          payload, processado: false, erro: 'WEBHOOK_SECRET ausente',
        })
        return new Response('Config error', { status: 500 })
      }

      assinaturaOk = await validarAssinatura(
        req.headers.get('x-signature'),
        req.headers.get('x-request-id'),
        paymentId,
        secret,
      )

      if (!assinaturaOk) {
        await registrarEvento(supabase, {
          evento_tipo: eventoTipo, payment_id: paymentId, assinatura_ok: false,
          payload, processado: false, erro: 'Assinatura inválida',
        })
        // 401 e não 5xx: não queremos retry de notificação forjada.
        return new Response('Invalid signature', { status: 401 })
      }
    }

    if (!paymentId) {
      await registrarEvento(supabase, {
        evento_tipo: eventoTipo, payment_id: null, assinatura_ok: assinaturaOk,
        payload, processado: true, erro: 'Sem payment ID',
      })
      return new Response('Missing payment ID', { status: 400 })
    }

    // Só tratamos notificações de pagamento
    if (eventoTipo && !String(eventoTipo).startsWith('payment')) {
      await registrarEvento(supabase, {
        evento_tipo: eventoTipo, payment_id: paymentId, assinatura_ok: assinaturaOk,
        payload, processado: true, erro: null,
      })
      return new Response('OK', { status: 200 })
    }

    // -------------------------------------------------------------------
    // 2. Reconsulta o pagamento na API do MP (fonte de verdade)
    // -------------------------------------------------------------------
    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) {
      console.error('MERCADOPAGO_ACCESS_TOKEN não definido.')
      return new Response('Config error', { status: 500 })
    }

    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } })
    const paymentClient = new Payment(client)
    const pagamento = await paymentClient.get({ id: paymentId }) as PagamentoMp

    const dadosStatus = dadosDaTransacao(pagamento)

    const requestId =
      pagamento.external_reference ||
      (pagamento.metadata?.request_id as string | undefined) ||
      null
    const obraId = (pagamento.metadata?.obra_id as string | undefined) ?? null
    let userId = (pagamento.metadata?.user_id as string | undefined) ?? null
    if (userId === 'guest' || !userId) userId = null

    if (!dadosStatus) {
      console.warn(`Status do MP não mapeado: ${pagamento.status} (payment ${paymentId})`)
      await registrarEvento(supabase, {
        evento_tipo: eventoTipo, payment_id: paymentId, assinatura_ok: assinaturaOk,
        payload, processado: true, erro: `Status não mapeado: ${pagamento.status}`,
      })
      return new Response('OK', { status: 200 })
    }

    // -------------------------------------------------------------------
    // 3. Atualiza a transação pendente criada em create_preference
    // -------------------------------------------------------------------
    let aplicado = false
    let statusFinal = dadosStatus.status

    if (requestId) {
      try {
        // Mesmas regras de verificar_pagamento (inclui não desfazer uma
        // transação já confirmada por outro pagamento).
        const resultado = await aplicarNaTransacao(supabase, requestId, pagamento)
        aplicado = !!resultado?.existe
        if (resultado) statusFinal = resultado.status
      } catch (error) {
        console.error('Erro ao atualizar transação por request_id:', error)
        throw error
      }
    }

    // Fallback: notificação sem transação pendente correspondente
    if (!aplicado) {
      if (!obraId || !userId) {
        console.error(`Pagamento ${paymentId} sem transação pendente e sem metadata suficiente.`)
        await registrarEvento(supabase, {
          evento_tipo: eventoTipo, payment_id: paymentId, assinatura_ok: assinaturaOk,
          payload, processado: true, erro: 'Sem transação pendente nem metadata',
        })
        return new Response('OK', { status: 200 })
      }

      const { error } = await supabase
        .from('transacoes')
        .upsert(
          { usuario_id: userId, obra_id: obraId, request_id: requestId, gateway: 'mercadopago', ...dadosStatus },
          { onConflict: 'gateway_id' },
        )

      if (error) {
        console.error('Erro no upsert da transação:', error)
        throw error
      }
    }

    await registrarEvento(supabase, {
      evento_tipo: eventoTipo, payment_id: paymentId, assinatura_ok: assinaturaOk,
      payload, processado: true, erro: ehIpn ? 'IPN sem assinatura: confirmado na API do MP' : null,
    })

    console.log(`Pagamento ${paymentId} (${pagamento.status}) -> transação ${statusFinal} (request_id: ${requestId}${ehIpn ? ", via IPN" : ""})`)
    return new Response('OK', { status: 200 })
  } catch (error) {
    // 5xx só aqui: falha transitória, o MP deve reenviar.
    console.error('Erro no processamento do webhook:', error)
    await registrarEvento(supabase, {
      evento_tipo: null, payment_id: null, assinatura_ok: null,
      payload: null, processado: false,
      erro: error instanceof Error ? error.message : String(error),
    })
    return new Response('Internal Server Error', { status: 500 })
  }
})
