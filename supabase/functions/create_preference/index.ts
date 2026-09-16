import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { MercadoPagoConfig, Preference } from 'npm:mercadopago'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Trata requisições OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { obra_id, valor, titulo, user_id } = await req.json()

    // Validação básica
    if (!obra_id || valor === undefined || !titulo) {
      return new Response(
        JSON.stringify({ error: 'Faltam parâmetros obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (valor <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valor da contribuição deve ser maior que 0.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Exige usuário autenticado: sem isso a transação aprovada nunca
    // apareceria na Biblioteca de ninguém (usuario_id ficaria nulo)
    if (!user_id || user_id === 'guest') {
      return new Response(
        JSON.stringify({ error: 'É necessário estar logado para contribuir.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Inicializa cliente Mercado Pago
    // É necessário ter a variável de ambiente MERCADOPAGO_ACCESS_TOKEN configurada no Supabase
    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');

    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN não está definido no ambiente.");
      return new Response(
        JSON.stringify({ error: 'Erro de configuração no gateway de pagamento.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
    const preference = new Preference(client);

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';

    // Identificador único desta tentativa de pagamento.
    // O frontend vai usar isso para consultar o status na página de sucesso,
    // e o webhook vai gravar esse mesmo valor na transação quando o
    // pagamento for aprovado.
    const requestId = crypto.randomUUID();

    // Cria a preferência de pagamento (Checkout Pro)
    const response = await preference.create({
      body: {
        items: [
          {
            id: obra_id,
            title: `Contribuição - ${titulo}`,
            quantity: 1,
            unit_price: Number(valor),
            currency_id: 'BRL',
          }
        ],
        // Metadados lidos pelo webhook para saber o que gravar
        metadata: {
          obra_id,
          user_id,
          request_id: requestId,
        },
        back_urls: {
          success: `${siteUrl}/sucesso?request_id=${requestId}`,
          failure: `${siteUrl}/obra/${obra_id}?error=payment_failed`,
          pending: `${siteUrl}/sucesso?request_id=${requestId}&status=pending`
        },
        auto_return: 'approved',
        payment_methods: {
          excluded_payment_types: [
            { id: "ticket" } // Exclui boleto para o MVP, mantendo PIX e Cartão
          ],
          installments: 1
        }
      }
    });

    return new Response(
      JSON.stringify({
        id: response.id,
        init_point: response.init_point,
        request_id: requestId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro ao criar preferência:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})