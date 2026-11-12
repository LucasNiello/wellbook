/**
 * Variáveis públicas do Supabase (apps/web/.env.local). Só URL e chave PUBLICÁVEL:
 * a chave secreta nunca entra no app (quem protege os dados é a RLS).
 * Leitura direta de process.env.NEXT_PUBLIC_* para o Next embutir no bundle do navegador.
 */
export function urlSupabase(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL em apps/web/.env.local (veja .env.example).');
  return v;
}

export function chavePublicavel(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!v)
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/web/.env.local (veja .env.example).');
  return v;
}
