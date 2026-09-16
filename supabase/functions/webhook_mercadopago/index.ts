import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { MercadoPagoConfig, Payment } from 'npm:mercadopago'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Apenas aceita requisições POST
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(req.url)

    // O Mercado Pago pode mandar o ID na query string (?data.id=123) ou no body
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id')

    if (!paymentId) {
      const body = await req.json().catch(() => ({}))
      if (body?.data?.id) {
        paymentId = body.data.id
      }
    }

    if (!paymentId) {
      return new Response('Missing payment ID', { status: 400 })
    }

    // Inicializa cliente Mercado Pago
    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN não está definido no ambiente.");
      return new Response('Config error', { status: 500 })
    }

    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
    const paymentClient = new Payment(client);

    // Busca os detalhes do pagamento diretamente na API do Mercado Pago.
    // Nunca confiamos no status que vem na notificação em si.
    const paymentData = await paymentClient.get({ id: paymentId });

    // Verifica se foi aprovado
    if (paymentData.status === 'approved') {
      const obraId = paymentData.metadata?.obra_id;
      const requestId = paymentData.metadata?.request_id || null;
      let userId = paymentData.metadata?.user_id;

      // Converte user_id null ou 'guest' para nulo real para o banco se não for UUID válido
      if (userId === 'guest' || !userId) {
        userId = null;
      }

      if (!obraId) {
        console.error("Pagamento aprovado, mas sem metadata de obra_id", paymentId);
        return new Response('OK', { status: 200 }) // Retorna OK para o MP não ficar tentando novamente
      }

      if (!userId) {
        console.error("Pagamento aprovado, mas sem usuario_id válido em metadata", paymentId);
        return new Response('OK', { status: 200 })
      }

      // Inicializa Supabase Client com Service Role para bypass de RLS
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error("Credenciais do Supabase ausentes no ambiente.");
        return new Response('Config error', { status: 500 })
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // Verifica se a transação já existe para não duplicar
      // (o Mercado Pago costuma reenviar a mesma notificação)
      const { data: existingTx, error: existingTxError } = await supabase
        .from('transacoes')
        .select('id')
        .eq('gateway_id', paymentId.toString())
        .maybeSingle()

      if (existingTxError) {
        console.error("Erro ao verificar transação existente:", existingTxError)
      }

      if (!existingTx) {
        // Insere a transação
        const { error: insertError } = await supabase
          .from('transacoes')
          .insert({
            usuario_id: userId,
            obra_id: obraId,
            valor_pago: paymentData.transaction_amount || 0,
            status: 'concluido',
            gateway_id: paymentId.toString(),
            request_id: requestId,
          })

        if (insertError) {
          console.error("Erro ao inserir transação:", insertError)
          throw insertError
        }

        console.log(`Transação ${paymentId} registrada com sucesso para obra ${obraId} (request_id: ${requestId})`);
      }
    }

    // Sempre retorna 200 OK para o Mercado Pago
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Erro no processamento do webhook:', error)
    // O Mercado Pago fará retry se não retornar 200, então cuidado com 500
    return new Response('Internal Server Error', { status: 500 })
  }
})