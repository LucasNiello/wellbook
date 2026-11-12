/**
 * Papéis do usuário logado (Fase 3: carregamento de perfis/papéis e proteção de rotas).
 * Fonte: o banco (RLS já testada na Fase 2), nunca metadados do token.
 * D10: membros_tenant guarda só o papel admin; quem atende é a linha ATIVA em profissionais.
 * Todo usuário logado é também cliente (RN14: agenda em qualquer clínica com a mesma conta).
 */

export type Papel = 'super_admin' | 'admin' | 'profissional' | 'cliente';

export interface DadosPapeis {
  superAdmin: boolean;
  /** tenant_id de cada linha de membros_tenant do usuário (papel admin). */
  tenantsAdmin: readonly string[];
  /** Linhas de profissionais do usuário (RN14: no máximo uma). */
  profissionais: readonly { tenantId: string; ativo: boolean }[];
}

export interface PapeisUsuario {
  papeis: readonly Papel[];
  /** Tenant em que o usuário é admin (o primeiro, se houver). */
  tenantAdmin: string | null;
  /** Tenant em que o usuário atende (só profissional ativo). */
  tenantProfissional: string | null;
}

export function derivarPapeis(d: DadosPapeis): PapeisUsuario {
  const papeis: Papel[] = [];
  if (d.superAdmin) papeis.push('super_admin');
  const tenantAdmin = d.tenantsAdmin[0] ?? null;
  if (tenantAdmin) papeis.push('admin');
  const ativo = d.profissionais.find((p) => p.ativo);
  const tenantProfissional = ativo?.tenantId ?? null;
  if (tenantProfissional) papeis.push('profissional');
  papeis.push('cliente');
  return { papeis, tenantAdmin, tenantProfissional };
}

/** Área de cada papel (web e mobile usam os mesmos prefixos). */
export const ROTA_DO_PAPEL: Readonly<Record<Papel, string>> = {
  super_admin: '/super-admin',
  admin: '/admin',
  profissional: '/profissional',
  cliente: '/conta',
};

/** Rota inicial depois do login: o papel de maior privilégio. */
export function rotaInicial(papeis: readonly Papel[]): string {
  for (const p of ['super_admin', 'admin', 'profissional'] as const) {
    if (papeis.includes(p)) return ROTA_DO_PAPEL[p];
  }
  return ROTA_DO_PAPEL.cliente;
}

/**
 * Papel exigido por uma rota protegida, ou null se a rota só exige login (ou é pública).
 * A proteção na interface é conveniência: quem garante o acesso é a RLS.
 */
export function papelExigido(caminho: string): Papel | null {
  for (const p of ['super_admin', 'admin', 'profissional'] as const) {
    const base = ROTA_DO_PAPEL[p];
    if (caminho === base || caminho.startsWith(`${base}/`)) return p;
  }
  return null;
}

/** Rotas que exigem login (qualquer papel). RF06: agendar exige login — a tela de agendar chega na Fase 5. */
export const ROTAS_LOGADAS: readonly string[] = ['/conta', '/trocar-senha'];

export function exigeLogin(caminho: string): boolean {
  return (
    papelExigido(caminho) !== null ||
    ROTAS_LOGADAS.some((r) => caminho === r || caminho.startsWith(`${r}/`))
  );
}

export function podeAcessar(caminho: string, papeis: readonly Papel[]): boolean {
  const exigido = papelExigido(caminho);
  return exigido === null || papeis.includes(exigido);
}
