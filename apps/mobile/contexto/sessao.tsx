import type { Session } from '@supabase/supabase-js';
import { derivarPapeis, type PapeisUsuario } from '@wellbook/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

export interface PerfilUsuario {
  nome: string;
  email: string;
  telefone: string | null;
}

interface ValorSessao {
  sessao: Session | null;
  carregando: boolean;
  perfil: PerfilUsuario | null;
  papeis: PapeisUsuario;
  trocaSenhaObrigatoria: boolean;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
}

const PAPEIS_VAZIOS: PapeisUsuario = { papeis: [], tenantAdmin: null, tenantProfissional: null };

const Contexto = createContext<ValorSessao | null>(null);

interface LinhaUsuario {
  nome: string;
  email: string;
  telefone: string | null;
  super_admin: boolean;
  troca_senha_obrigatoria: boolean;
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [papeis, setPapeis] = useState<PapeisUsuario>(PAPEIS_VAZIOS);
  const [troca, setTroca] = useState(false);

  // Papéis vêm sempre do banco (RLS), nunca de metadados do token.
  const carregarPerfil = useCallback(async (id: string | null) => {
    if (!id) {
      setPerfil(null);
      setPapeis(PAPEIS_VAZIOS);
      setTroca(false);
      return;
    }
    const [u, m, p] = await Promise.all([
      supabase
        .from('usuarios')
        .select('nome, email, telefone, super_admin, troca_senha_obrigatoria')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('membros_tenant').select('tenant_id').eq('usuario_id', id),
      supabase.from('profissionais').select('tenant_id, ativo').eq('usuario_id', id),
    ]);
    const usuario = u.data as LinhaUsuario | null;
    const membros = (m.data ?? []) as { tenant_id: string }[];
    const profissionais = (p.data ?? []) as { tenant_id: string; ativo: boolean }[];
    setPerfil(
      usuario ? { nome: usuario.nome, email: usuario.email, telefone: usuario.telefone } : null,
    );
    setTroca(usuario?.troca_senha_obrigatoria ?? false);
    // Perfil não carregou (rede/RLS): nenhum papel, nem cliente — a guarda não libera área nenhuma.
    if (!usuario) {
      setPapeis(PAPEIS_VAZIOS);
      return;
    }
    setPapeis(
      derivarPapeis({
        superAdmin: usuario?.super_admin ?? false,
        tenantsAdmin: membros.map((x) => x.tenant_id),
        profissionais: profissionais.map((x) => ({ tenantId: x.tenant_id, ativo: x.ativo })),
      }),
    );
  }, []);

  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      await carregarPerfil(data.session?.user.id ?? null);
      if (ativo) setCarregando(false);
    });
    const { data: inscricao } = supabase.auth.onAuthStateChange((evento, nova) => {
      if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return;
      // A guarda só decide com o perfil carregado (senão manda admin para /conta e a D20 pisca).
      setCarregando(true);
      setSessao(nova);
      // Adia a consulta: não chamar o Supabase dentro do callback (evita deadlock).
      setTimeout(() => {
        void carregarPerfil(nova?.user.id ?? null).finally(() => {
          if (ativo) setCarregando(false);
        });
      }, 0);
    });
    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSessao(data.session);
    await carregarPerfil(data.session?.user.id ?? null);
  }, [carregarPerfil]);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo<ValorSessao>(
    () => ({ sessao, carregando, perfil, papeis, trocaSenhaObrigatoria: troca, recarregar, sair }),
    [sessao, carregando, perfil, papeis, troca, recarregar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ValorSessao {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSessao precisa estar dentro de ProvedorSessao.');
  return v;
}
