'use client';

import { createBrowserClient } from '@supabase/ssr';
import { urlSupabase, chavePublicavel } from './config';

/** Cliente do Supabase para componentes de cliente (sessão em cookies, compartilhada com o servidor). */
export function criarClienteNavegador() {
  return createBrowserClient(urlSupabase(), chavePublicavel());
}
