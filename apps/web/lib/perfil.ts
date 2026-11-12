import type { SupabaseClient } from '@supabase/supabase-js';
import { derivarPapeis, type PapeisUsuario } from '@wellbook/shared';

export interface PerfilLogado extends PapeisUsuario {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  trocaSenhaObrigatoria: boolean;
}

/**
 * Carrega o perfil e os papéis do usuário logado a partir do banco (RLS: cada um lê as próprias linhas).
 * D10: admin = membros_tenant; profissional = linha ATIVA em profissionais.
 */
export async function carregarPerfil(supabase: SupabaseClient, idUsuario: string): Promise<PerfilLogado | null> {
  const [usuario, membros, profissionais] = await Promise.all([
    supabase
      .from('usuarios')
      .select('nome, email, telefone, super_admin, troca_senha_obrigatoria')
      .eq('id', idUsuario)
      .maybeSingle(),
    supabase.from('membros_tenant').select('tenant_id').eq('usuario_id', idUsuario),
    supabase.from('profissionais').select('tenant_id, ativo').eq('usuario_id', idUsuario),
  ]);
  if (usuario.error || !usuario.data) return null;
  const u = usuario.data as {
    nome: string;
    email: string;
    telefone: string | null;
    super_admin: boolean;
    troca_senha_obrigatoria: boolean;
  };
  const papeis = derivarPapeis({
    superAdmin: u.super_admin,
    tenantsAdmin: ((membros.data ?? []) as { tenant_id: string }[]).map((m) => m.tenant_id),
    profissionais: ((profissionais.data ?? []) as { tenant_id: string; ativo: boolean }[]).map((p) => ({
      tenantId: p.tenant_id,
      ativo: p.ativo,
    })),
  });
  return {
    id: idUsuario,
    nome: u.nome,
    email: u.email,
    telefone: u.telefone,
    trocaSenhaObrigatoria: u.troca_senha_obrigatoria,
    ...papeis,
  };
}
