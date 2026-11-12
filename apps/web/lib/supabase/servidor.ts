import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { urlSupabase, chavePublicavel } from './config';

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers (um por requisição). */
export async function criarClienteServidor() {
  const loja = await cookies();
  return createServerClient(urlSupabase(), chavePublicavel(), {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (paraGravar) => {
        try {
          paraGravar.forEach(({ name, value, options }) => loja.set(name, value, options));
        } catch {
          // Server Component não grava cookies; o proxy.ts renova a sessão a cada requisição.
        }
      },
    },
  });
}
