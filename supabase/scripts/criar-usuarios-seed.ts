/**
 * Cria as contas do seed no Supabase Auth (D18), pela Admin API.
 *
 * Lê do .env da RAIZ do repositório (nunca escreva valores aqui):
 *   SUPABASE_URL          — URL do projeto (ex.: https://<ref>.supabase.co)
 *   SUPABASE_SECRET_KEY   — chave secreta (sb_secret_… ou a service_role antiga). NUNCA no app.
 *   SEED_SENHA            — senha usada em todas as contas de teste (mín. 8 caracteres).
 *
 * Uso (na pasta supabase/):  pnpm usuarios:seed
 * Ordem: 1) migrations  2) este script  3) supabase/seed.sql no SQL Editor.
 * É idempotente: conta que já existe é mantida.
 */
import { createClient } from '@supabase/supabase-js';

interface ContaSeed {
  email: string;
  nome: string;
  telefone: string;
  perfil: string;
}

const CONTAS: readonly ContaSeed[] = [
  { email: 'superadmin@example.com', nome: 'Sofia Wellbook', telefone: '', perfil: 'Super Admin' },
  { email: 'admin@example.com', nome: 'Helena Duarte', telefone: '11911110000', perfil: 'Admin (também atende)' },
  { email: 'cabelo@example.com', nome: 'Rafael Lima', telefone: '11922220000', perfil: 'Profissional — cabeleireiro' },
  { email: 'manicure@example.com', nome: 'Juliana Prado', telefone: '11933330000', perfil: 'Profissional — manicure' },
  { email: 'psicologa@example.com', nome: 'Marina Costa', telefone: '11944440000', perfil: 'Profissional — psicóloga' },
  { email: 'cliente@example.com', nome: 'Carla Mendes', telefone: '11955550000', perfil: 'Cliente' },
];

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`Falta a variável ${nome} no .env da raiz (veja .env.example).`);
    process.exit(1);
  }
  return valor;
}

const url = exigir('SUPABASE_URL');
const chaveSecreta = exigir('SUPABASE_SECRET_KEY');
const senha = exigir('SEED_SENHA');
if (senha.length < 8) {
  console.error('SEED_SENHA precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}

const supabase = createClient(url, chaveSecreta, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let falhas = 0;
for (const conta of CONTAS) {
  const { error } = await supabase.auth.admin.createUser({
    email: conta.email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: conta.nome, telefone: conta.telefone },
    // DPc7: contas criadas pela clínica/plataforma dispensam o consentimento do cadastro do app.
    app_metadata: { criado_pela_clinica: true },
  });
  if (!error) {
    console.log(`✔ criada: ${conta.email} (${conta.perfil})`);
  } else if (/already|registered|exists/i.test(error.message)) {
    console.log(`• já existia: ${conta.email}`);
  } else {
    falhas += 1;
    console.error(`✖ ${conta.email}: ${error.message}`);
  }
}

if (falhas > 0) process.exit(1);
console.log('Pronto. Agora rode supabase/seed.sql no SQL Editor.');
