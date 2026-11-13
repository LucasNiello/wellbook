/** Fase 4 · D20/DPc7: contas de admin e profissional com senha provisória. */
import { createClient } from 'jsr:@supabase/supabase-js@2';

declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(tratar: (req: Request) => Response | Promise<Response>): void;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function segredo(nome: string) {
  const valor = Deno.env.get(nome);
  if (!valor) throw new Error(`Configuração ausente: ${nome}`);
  return valor;
}
function senhaTemporaria() {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%'];
  const caracteres = grupos.join('');
  const numeros = crypto.getRandomValues(new Uint8Array(48));
  const senha = grupos.map((grupo, indice) => grupo[numeros[indice] % grupo.length]);
  for (let i = 4; i < 24; i++) senha.push(caracteres[numeros[i] % caracteres.length]);
  for (let i = senha.length - 1; i > 0; i--) {
    const j = numeros[i + 24] % (i + 1);
    [senha[i], senha[j]] = [senha[j], senha[i]];
  }
  return senha.join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return resposta(401, { erro: 'Entre na sua conta para continuar.' });

  try {
    const entrada = await req.json() as Record<string, unknown>;
    const tipo = entrada.tipo;
    const tenantId = typeof entrada.tenantId === 'string' ? entrada.tenantId : '';
    const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : '';
    const email = typeof entrada.email === 'string' ? entrada.email.trim().toLowerCase() : '';
    const telefone = typeof entrada.telefone === 'string' ? entrada.telefone.replace(/\D/g, '') : '';
    const especialidade = typeof entrada.especialidade === 'string' ? entrada.especialidade.trim() : '';
    const percentual = entrada.percentualRepasse;
    if ((tipo !== 'admin' && tipo !== 'profissional') || !UUID.test(tenantId) || nome.length < 2 || nome.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (telefone && (telefone.length < 10 || telefone.length > 15))) {
      return resposta(400, { erro: 'Confira nome, e-mail, telefone e clínica.' });
    }
    if (tipo === 'profissional' && (especialidade.length < 2 || especialidade.length > 80 || typeof percentual !== 'number' || !Number.isInteger(percentual) || percentual < 0 || percentual > 10000)) {
      return resposta(400, { erro: 'Confira a especialidade e o percentual de repasse.' });
    }

    const url = segredo('SUPABASE_URL');
    const comoUsuario = createClient(url, segredo('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: autenticado, error: erroAuth } = await comoUsuario.auth.getUser(jwt);
    if (erroAuth || !autenticado.user) return resposta(401, { erro: 'Sessão inválida. Entre novamente.' });
    const usuarioId = autenticado.user.id;
    const admin = createClient(url, segredo('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: perfil, error: erroPerfil } = await admin.from('usuarios').select('super_admin,troca_senha_obrigatoria').eq('id', usuarioId).single();
    if (erroPerfil || !perfil || perfil.troca_senha_obrigatoria) return resposta(403, { erro: 'Você não tem acesso a esta ação.' });
    if (tipo === 'admin') {
      if (!perfil.super_admin) return resposta(403, { erro: 'Somente o Super Admin pode criar administradores.' });
    } else {
      const { data: vinculo, error: erroVinculo } = await admin.from('membros_tenant').select('usuario_id').eq('tenant_id', tenantId).eq('usuario_id', usuarioId).eq('papel', 'admin').maybeSingle();
      if (erroVinculo || !vinculo) return resposta(403, { erro: 'Somente o administrador desta clínica pode criar profissionais.' });
    }
    const { data: clinica, error: erroClinica } = await admin.from('tenants').select('id,ativo').eq('id', tenantId).single();
    if (erroClinica || !clinica?.ativo) return resposta(404, { erro: 'Clínica indisponível.' });

    const senhaProvisoria = senhaTemporaria();
    const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
      email, password: senhaProvisoria, email_confirm: true,
      user_metadata: { nome, telefone: telefone || null },
      app_metadata: { criado_pela_clinica: true },
    });
    if (erroCriacao || !criado.user) return resposta(400, { erro: erroCriacao?.message ?? 'Não foi possível criar a conta.' });
    const novoId = criado.user.id;
    const { data: senhaMarcada, error: erroSenha } = await admin.from('usuarios').update({ troca_senha_obrigatoria: true }).eq('id', novoId).select('id').single();
    const vinculado = erroSenha || !senhaMarcada ? { data: null, error: erroSenha ?? new Error('Perfil não encontrado.') } : tipo === 'admin'
      ? await admin.from('membros_tenant').insert({ tenant_id: tenantId, usuario_id: novoId, papel: 'admin' })
      : await admin.from('profissionais').insert({ tenant_id: tenantId, usuario_id: novoId, especialidade, percentual_repasse: percentual }).select('id').single();
    if (vinculado.error) {
      // Sem papel e sem login quando a etapa de vínculo falha.
      await admin.auth.admin.deleteUser(novoId, true);
      return resposta(500, { erro: 'A conta não pôde ser vinculada à clínica. Tente novamente.' });
    }
    return resposta(201, { id: novoId, profissionalId: tipo === 'profissional' ? (vinculado.data as { id: string } | null)?.id : null, senhaProvisoria });
  } catch {
    return resposta(400, { erro: 'Solicitação inválida.' });
  }
});
