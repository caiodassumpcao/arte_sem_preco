// ============================================================================
// Regras compartilhadas de confirmação de pagamento do Mercado Pago.
//
// Usado pelo webhook (notificação do MP) e por verificar_pagamento (consulta
// ativa feita pela tela de sucesso). Os dois caminhos gravam a transação do
// mesmo jeito, então o resultado não depende de qual chegou primeiro.
//
// Em ambos, a fonte de verdade é sempre a API do MP — nunca o conteúdo da
// notificação ou do pedido do navegador.
// ============================================================================
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const SPLIT_AUTOR = 0.9

// status do MP -> status interno
export const STATUS_MAP: Record<string, string> = {
  approved: 'concluido',
  authorized: 'concluido',
  pending: 'pendente',
  in_process: 'pendente',
  in_mediation: 'contestado',
  rejected: 'falhou',
  cancelled: 'falhou',
  refunded: 'estornado',
  charged_back: 'contestado',
}

// Subconjunto dos campos de pagamento do MP que usamos.
export interface PagamentoMp {
  id?: number | string
  status?: string
  status_detail?: string
  payment_type_id?: string
  transaction_amount?: number
  date_approved?: string | null
  date_created?: string
  external_reference?: string
  metadata?: Record<string, unknown>
}

/** Campos da transação a gravar para este pagamento, ou null se o status não é conhecido. */
export function dadosDaTransacao(pagamento: PagamentoMp) {
  const statusInterno = STATUS_MAP[pagamento.status ?? '']
  if (!statusInterno) return null

  const valor = Number(pagamento.transaction_amount ?? 0)
  return {
    status: statusInterno,
    valor_pago: valor,
    gateway_id: String(pagamento.id),
    metodo_pagamento: pagamento.payment_type_id ?? null,
    valor_autor: Math.round(valor * SPLIT_AUTOR * 100) / 100,
    valor_plataforma: Math.round(valor * (1 - SPLIT_AUTOR) * 100) / 100,
    status_repasse: statusInterno === 'concluido' ? 'pendente' : 'nao_aplicavel',
    gateway_payload: {
      status: pagamento.status,
      status_detail: pagamento.status_detail,
      payment_type_id: pagamento.payment_type_id,
      date_approved: pagamento.date_approved,
    },
  }
}

/**
 * Uma mesma transação pode ter mais de um pagamento no MP (ex.: a pessoa gerou
 * um Pix, ele expirou e gerou outro). Vale o aprovado; sem aprovado, o mais
 * recente.
 */
export function escolherPagamento(pagamentos: PagamentoMp[]): PagamentoMp | null {
  if (pagamentos.length === 0) return null
  const aprovado = pagamentos.find((p) => p.status === 'approved' || p.status === 'authorized')
  if (aprovado) return aprovado
  return [...pagamentos].sort((a, b) => String(b.date_created ?? '').localeCompare(String(a.date_created ?? '')))[0]
}

/** Grava o pagamento na transação de request_id. `existe` = havia transação com esse request_id. */
export async function aplicarNaTransacao(
  supabase: SupabaseClient,
  requestId: string,
  pagamento: PagamentoMp,
): Promise<{ status: string; linhas: number; existe: boolean } | null> {
  const dados = dadosDaTransacao(pagamento)
  if (!dados) return null

  // Uma transação já confirmada por um pagamento não volta atrás por causa de
  // OUTRO pagamento (ex.: o Pix expirado notificado depois do Pix pago).
  // Estorno/contestação do mesmo pagamento continuam valendo.
  const { data: atual, error: leituraErro } = await supabase
    .from('transacoes')
    .select('status, gateway_id')
    .eq('request_id', requestId)
    .maybeSingle()
  if (leituraErro) throw leituraErro
  if (
    atual?.status === 'concluido' &&
    atual.gateway_id &&
    atual.gateway_id !== dados.gateway_id &&
    dados.status !== 'concluido'
  ) {
    return { status: atual.status, linhas: 0, existe: true }
  }

  const { data, error } = await supabase
    .from('transacoes')
    .update(dados)
    .eq('request_id', requestId)
    .select('id')
  if (error) throw error

  return { status: dados.status, linhas: data?.length ?? 0, existe: !!atual }
}
