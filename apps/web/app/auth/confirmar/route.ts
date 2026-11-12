/**
 * RF05: link do e-mail de recuperação no formato
 *   {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery
 * (template configurado no painel do Supabase). Valida o token no servidor e cria a sessão,
 * em qualquer navegador ou dispositivo — inclusive quando o pedido saiu do app mobile.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { criarClienteServidor } from '../../../lib/supabase/servidor';

const TIPOS_ACEITOS: readonly EmailOtpType[] = ['recovery'];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type') as EmailOtpType | null;
  if (tokenHash && tipo && TIPOS_ACEITOS.includes(tipo)) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (!error) return NextResponse.redirect(`${origin}/redefinir-senha`);
  }
  return NextResponse.redirect(`${origin}/entrar?erro=link-invalido`);
}
