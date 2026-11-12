/**
 * Proxy do Next 16 (antigo middleware): renova a sessão do Supabase a cada requisição e
 * faz a proteção de rotas por papel. É conveniência de navegação: quem garante o acesso
 * aos dados é a RLS do banco (Fase 2).
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { exigeLogin, papelExigido, podeAcessar, rotaInicial } from '@wellbook/shared';
import { carregarPerfil } from './lib/perfil';
import { chavePublicavel, urlSupabase } from './lib/supabase/config';

/** Telas de quem ainda não entrou: logado é mandado para a rota inicial. */
const TELAS_DE_ENTRADA = ['/entrar', '/cadastro', '/recuperar-senha'];

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  let cabecalhosSessao: Record<string, string> = {};

  const supabase = createServerClient(urlSupabase(), chavePublicavel(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (paraGravar, cabecalhos) => {
        paraGravar.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        paraGravar.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        cabecalhosSessao = cabecalhos;
        Object.entries(cabecalhos).forEach(([k, v]) => resposta.headers.set(k, v));
      },
    },
  });

  // getUser valida o token no servidor do Auth (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const redirecionar = (destino: string, erro?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = '';
    if (destino === '/entrar') url.searchParams.set('proxima', caminho);
    if (erro) url.searchParams.set('erro', erro);
    const r = NextResponse.redirect(url);
    // Leva junto os cookies renovados e os cabeçalhos anti-cache do @supabase/ssr.
    resposta.cookies.getAll().forEach((c) => r.cookies.set(c));
    Object.entries(cabecalhosSessao).forEach(([k, v]) => r.headers.set(k, v));
    return r;
  };

  if (!user) {
    return exigeLogin(caminho) ? redirecionar('/entrar') : resposta;
  }

  const precisaPerfil =
    exigeLogin(caminho) || papelExigido(caminho) !== null || TELAS_DE_ENTRADA.includes(caminho);
  if (!precisaPerfil) return resposta;

  const perfil = await carregarPerfil(supabase, user.id);
  // Perfil não carregou (rede/linha ausente): rota protegida NÃO segue sem a checagem de papel e da D20.
  if (!perfil) return exigeLogin(caminho) ? redirecionar('/entrar', 'perfil') : resposta;

  // D20: até trocar a senha provisória, só a tela de troca.
  if (perfil.trocaSenhaObrigatoria && caminho !== '/trocar-senha') return redirecionar('/trocar-senha');
  if (TELAS_DE_ENTRADA.includes(caminho)) return redirecionar(rotaInicial(perfil.papeis));
  if (!podeAcessar(caminho, perfil.papeis)) return redirecionar(rotaInicial(perfil.papeis));
  return resposta;
}

export const config = {
  // Tudo, menos arquivos estáticos e imagens.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
