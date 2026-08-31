import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
const envs = Object.fromEntries(envFile.split('\n').filter(l => l.includes('=')).map(line => line.split('=')))

const supabaseUrl = envs.VITE_SUPABASE_URL.trim().replace(/['"]/g, '')
const supabaseKey = envs.VITE_SUPABASE_ANON_KEY.trim().replace(/['"]/g, '')

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const existingEmail = 'test_1788183405401@gmail.com'
  const password = 'password123'

  console.log('--- TESTE: TENTANDO LOGIN COM USUARIO EXISTENTE ---')
  console.log('Email:', existingEmail)
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: existingEmail,
    password: password
  })

  if (loginError) {
    console.error('ERRO NO LOGIN:', loginError)
    return
  }

  console.log('Login OK! User ID:', loginData.user?.id)

  console.log('\n--- LER PERFIL AUTENTICADO EM public.usuarios ---')
  const { data: userRecord, error: userError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', loginData.user.id)
  
  if (userError) {
    console.error('ERRO AO BUSCAR USUARIO:', userError)
  } else {
    console.log('Perfil encontrado no banco:', userRecord)
  }
}

test()


