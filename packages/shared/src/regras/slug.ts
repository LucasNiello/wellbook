/**
 * D40: slug sugerido a partir do nome da empresa (editável no cadastro). O servidor valida e
 * resolve colisão com -2, -3… (RPC cadastrar_empresa). Mesmo formato do banco e do esquemaSlug.
 */
export const SLUG_MAXIMO = 60;

/**
 * D44: slugs iguais a rotas do app são recusados (o slug é imutável — D40 — e /[slug] perderia
 * para a rota estática). A mesma lista está na RPC cadastrar_empresa.
 */
export const SLUGS_RESERVADOS: readonly string[] = [
  'admin',
  'auth',
  'cadastro',
  'clinicas',
  'conta',
  'entrar',
  'privacidade',
  'profissional',
  'recuperar-senha',
  'redefinir-senha',
  'super-admin',
  'trocar-senha',
  'api',
];

export function slugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.includes(slug);
}

/** Sufixo da sugestão quando o nome vira um slug reservado (ex.: "Conta" → "conta-empresa"). */
const SUFIXO_RESERVADO = '-empresa';

export function gerarSlug(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAXIMO)
    .replace(/-+$/g, '');
  // D44: a sugestão nunca propõe um slug reservado.
  return slugReservado(slug) ? `${slug}${SUFIXO_RESERVADO}` : slug;
}
