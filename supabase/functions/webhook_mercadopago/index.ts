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
      const body = await req.json()
      if (body.data && body.data.id) {
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

    // Busca os detalhes do pagamento no Mercado Pago
    const paymentData = await paymentClient.get({ id: paymentId });

    // Verifica se foi aprovado
    if (paymentData.status === 'approved') {
      const obraId = paymentData.metadata?.obra_id;
      let userId = paymentData.metadata?.user_id;
      
      // Converte user_id null ou 'guest' para nulo real para o banco se não for UUID válido
      if (userId === 'guest' || !userId) {
        userId = null;
      }

      if (!obraId) {
        console.error("Pagamento aprovado, mas sem metadata de obra_id", paymentId);
        return new Response('OK', { status: 200 }) // Retorna OK para o MP não ficar tentando novamente
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
      const { data: existingTx } = await supabase
        .from('transacoes')
        .select('id')
        .eq('gateway_id', paymentId.toString())
        .single()

      if (!existingTx) {
        // Insere a transação
        const { error: insertError } = await supabase
          .from('transacoes')
          .insert({
            usuario_id: userId,
            obra_id: obraId,
            valor_pago: paymentData.transaction_amount || 0,
            status: 'concluido',
            gateway_id: paymentId.toString()
          })

        if (insertError) {
          console.error("Erro ao inserir transação:", insertError)
          throw insertError
        }
        
        console.log(`Transação ${paymentId} registrada com sucesso para obra ${obraId}`);
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
