import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── Diagnóstico de configuração ────────────────────────────────────────────
console.group('🔧 [Supabase Config] Diagnóstico de inicialização');
console.log('URL definida:', supabaseUrl ? `✅ ${supabaseUrl}` : '❌ NÃO DEFINIDA (VITE_SUPABASE_URL ausente no .env.local)');

if (!supabaseAnonKey) {
  console.error('❌ Anon Key: NÃO DEFINIDA (VITE_SUPABASE_ANON_KEY ausente no .env.local)');
} else if (!supabaseAnonKey.startsWith('eyJ')) {
  // Anon Keys do Supabase são JWTs e começam com "eyJ"
  console.error(
    '❌ Anon Key com FORMATO INVÁLIDO!',
    '\n   Valor atual:', supabaseAnonKey.slice(0, 30) + '...',
    '\n   O formato correto de uma Anon Key do Supabase é um JWT que começa com "eyJ...".',
    '\n   Acesse: Supabase Dashboard → Project Settings → API → "anon public" key.'
  );
} else {
  console.log('Anon Key: ✅ DEFINIDA e com formato JWT válido (eyJ...)');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase não está configurado corretamente. Autenticação e banco de dados vão falhar.');
}
console.groupEnd();
// ────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
