import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Diagnóstico apenas em desenvolvimento: em produção não expõe configuração.
if (import.meta.env.DEV) {
  const problemas = []

  if (!supabaseUrl) {
    problemas.push('VITE_SUPABASE_URL ausente no .env.local')
  }

  if (!supabaseAnonKey) {
    problemas.push('VITE_SUPABASE_ANON_KEY ausente no .env.local')
  } else {
    // Duas gerações de chave pública são válidas:
    //   legada  -> JWT, começa com "eyJ"
    //   atual   -> "sb_publishable_..."
    const formatoOk =
      supabaseAnonKey.startsWith('eyJ') ||
      supabaseAnonKey.startsWith('sb_publishable_')

    if (!formatoOk) {
      problemas.push(
        'VITE_SUPABASE_ANON_KEY com formato inesperado. ' +
        'Use a chave "anon public" (eyJ...) ou a publishable key (sb_publishable_...) ' +
        'em Project Settings -> API.'
      )
    }

    // Guarda-corpo: a service role key nunca deve chegar ao frontend.
    if (supabaseAnonKey.startsWith('sb_secret_') || supabaseAnonKey.includes('service_role')) {
      problemas.push('ATENÇÃO: uma chave secreta/service_role foi colocada no frontend. Remova imediatamente.')
    }
  }

  if (problemas.length > 0) {
    console.warn('[Supabase] Configuração incompleta:\n- ' + problemas.join('\n- '))
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
