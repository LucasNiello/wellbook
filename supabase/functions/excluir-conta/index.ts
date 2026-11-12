/**
 * Edge Function `excluir-conta` (D22 / RNF05). Sem deploy: o Lucas publica depois.
 *
 * Fluxo:
 *  1. Valida o JWT de quem chamou (só o próprio usuário exclui a própria conta).
 *  2. Chama a RPC `excluir_minha_conta` COMO O USUÁRIO: cancela os AGENDADO futuros, apaga as
 *     observações, anonimiza os dados pessoais e mantém as conclusões (regras e recusas no banco).
 *  3. Encerra as sessões e remove o usuário do Auth pela Admin API, com soft delete: a linha em
 *     auth.users fica (public.usuarios.id aponta para ela, e o histórico da clínica precisa dela),
 *     mas a conta deixa de existir para login.
 *
 * Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são fornecidas pelo
 * próprio runtime das Edge Functions. Nenhuma chave neste arquivo.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Tipagem mínima do runtime Deno (este arquivo não entra no typecheck do Node).
declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(tratar: (req: Request) => Response | Promise<Response>): void;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function variavel(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Variável ${nome} ausente no runtime.`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' });

  const autorizacao = req.headers.get('Authorization') ?? '';
  const jwt = autorizacao.replace(/^Bearer\s+/i, '');
  if (!jwt) return responder(401, { erro: 'Faça login para excluir sua conta.' });

  const url = variavel('SUPABASE_URL');
  // Cliente "como o usuário": a RPC enxerga auth.uid() = quem chamou.
  const comoUsuario = createClient(url, variavel('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, variavel('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: quem, error: erroUsuario } = await comoUsuario.auth.getUser(jwt);
  if (erroUsuario || !quem.user) return responder(401, { erro: 'Sessão inválida. Entre de novo.' });

  const { error: erroRpc } = await comoUsuario.rpc('excluir_minha_conta');
  if (erroRpc) {
    const vinculo = erroRpc.message.startsWith('CONTA_COM_VINCULO');
    return responder(vinculo ? 403 : 400, {
      erro: vinculo
        ? 'Contas de clínica ou de profissional são encerradas pela administração.'
        : 'Não foi possível excluir a conta agora. Tente de novo.',
    });
  }

  // Dados já anonimizados em public.usuarios; limpa também os metadados do cadastro guardados no
  // Auth (nome, telefone, consentimento), que o soft delete não apaga (revisão da continuação, item 1).
  const { error: erroMetadados } = await admin.auth.admin.updateUserById(quem.user.id, {
    user_metadata: { nome: null, telefone: null, consentimento_lgpd: null },
  });
  if (erroMetadados) {
    return responder(500, { erro: 'Seus dados foram removidos, mas houve uma falha ao encerrar a conta. Tente de novo.' });
  }
  // Agora a conta deixa de existir para login.
  await admin.auth.admin.signOut(jwt, 'global');
  const { error: erroExclusao } = await admin.auth.admin.deleteUser(quem.user.id, true);
  if (erroExclusao) {
    // Os dados pessoais já foram anonimizados; só a remoção no Auth falhou (pode ser refeita).
    return responder(500, { erro: 'Seus dados foram removidos, mas houve uma falha ao encerrar a conta. Tente de novo.' });
  }
  return responder(200, { ok: true });
});
