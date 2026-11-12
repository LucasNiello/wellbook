/**
 * Retorno de links do Supabase Auth no fluxo PKCE (`?code=`): troca o código por sessão.
 * Funciona só no mesmo navegador que pediu o link (o verificador fica num cookie).
 * Para a recuperação de senha, o caminho preferido é /auth/confirmar (independe do dispositivo).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { destinoSeguro } from '@wellbook/shared';
import { criarClienteServidor } from '../../../lib/supabase/servidor';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get('code');
  const destino = destinoSeguro(searchParams.get('proxima'));
  if (codigo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/entrar?erro=link-invalido`);
}
