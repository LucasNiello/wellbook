/**
 * Etapa B (D28–D43): cadastro de empresa pelo próprio usuário, proteção dos campos de tenants,
 * vínculos de admin e RPC meus_clientes_atendidos.
 * Escrito a partir da especificação (contrato informado + CLAUDE.md seção 7.3), sem ler a migration.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { criarBanco, IDS, type Banco, type Executor } from './apoio/banco.ts';

const U = IDS.usuarios;
const T = IDS.tenants;
const P = IDS.profissionais;

let banco: Banco;

beforeAll(async () => {
  banco = await criarBanco();
}, 120_000);

afterAll(async () => {
  await banco.fechar();
});

// ---------- apoio ----------

const CADASTRAR = `select r->>'tenant_id' as tenant_id, r->>'slug' as slug
                     from (select public.cadastrar_empresa($1::text, $2::text, $3::boolean, $4::text) as r) x`;

interface Cadastro {
  tenant_id: string;
  slug: string;
}

let contadorSavepoint = 0;

/** Executa algo que deve falhar, dentro de um savepoint (a transação continua utilizável). */
async function falha(
  tx: Executor,
  fn: () => Promise<unknown>,
): Promise<{ mensagem: string; codigo: string | undefined }> {
  const nome = `sp_${++contadorSavepoint}`;
  await tx.executar(`savepoint ${nome}`);
  try {
    await fn();
  } catch (erro) {
    await tx.executar(`rollback to savepoint ${nome}`);
    return { mensagem: (erro as Error).message, codigo: (erro as { code?: string }).code };
  }
  await tx.executar(`release savepoint ${nome}`);
  throw new Error('Era esperado um erro, mas a operação deu certo.');
}

function cadastrar(
  tx: Executor,
  nome: string,
  slug: string,
  sozinho: boolean,
  especialidade: string | null = null,
): Promise<Cadastro[]> {
  return tx.consultar<Cadastro>(CADASTRAR, [nome, slug, sozinho, especialidade]);
}

const novoId = (n: number): string => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Cria um usuário sem nenhum vínculo (como a Admin API: marca criado_pela_clinica). Rodar como postgres. */
async function criarUsuario(tx: Executor, n: number, nome: string, telefone = '11900000000'): Promise<string> {
  const id = novoId(n);
  await tx.consultar(
    `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
     values ($1, $2, $3::jsonb, '{"criado_pela_clinica": true}'::jsonb)`,
    [id, `novo${n}@example.com`, JSON.stringify({ nome, telefone })],
  );
  return id;
}

async function contar(tx: Executor, sql: string, parametros: unknown[] = []): Promise<number> {
  const linhas = await tx.consultar<{ n: number }>(`select count(*)::int as n from (${sql}) q`, parametros);
  return linhas[0]!.n;
}

/** Cria (como postgres) um agendamento passado de um cliente com um profissional; CONCLUIDO ganha conclusão. */
async function criarAtendimento(
  tx: Executor,
  clienteId: string,
  profissionalId: string,
  diasAtras: number,
  status: 'CONCLUIDO' | 'AGENDADO' | 'CANCELADO' | 'NAO_COMPARECEU',
): Promise<string> {
  const futuro = status === 'AGENDADO';
  const sinal = futuro ? '+' : '-';
  const linhas = await tx.consultar<{ id: string }>(
    `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
     values (gen_random_uuid(), $1, $2, $3,
             now() ${sinal} ($4::int * interval '1 day'),
             now() ${sinal} ($4::int * interval '1 day') + interval '1 hour', $5::public.status_agendamento)
     returning id`,
    [T.a, clienteId, profissionalId, diasAtras, status],
  );
  const id = linhas[0]!.id;
  await tx.consultar(
    `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
    [T.a, id, IDS.servicos.corte],
  );
  if (status === 'CONCLUIDO') {
    await tx.consultar(
      `insert into conclusoes (tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido, forma_pagamento,
                              percentual_repasse, valor_clinica, valor_profissional)
       values ($1, $2, 15000, 0, 15000, 'pix', 3000, 4500, 10500)`,
      [T.a, id],
    );
  }
  return id;
}

async function desativarProfissional(tx: Executor, profissionalId: string): Promise<void> {
  await tx.consultar(`update profissionais set ativo = false where id = $1`, [profissionalId]);
}

const MEUS_CLIENTES = `select * from public.meus_clientes_atendidos()`;

interface ClienteAtendido {
  id: string;
  nome: string;
  telefone: string | null;
}

// ---------- A. cadastrar_empresa ----------

describe('Etapa B / A: public.cadastrar_empresa', () => {
  it('D28: cliente puro (Carla) no modo equipe cria o tenant ativo, vira admin e não vira profissional', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const [res] = await cadastrar(tx, 'Espaço Aurora', 'espaco-aurora', false);
      await tx.trocarPara('postgres');
      const tenant = await tx.consultar<{ nome: string; ativo: boolean; slug: string }>(
        `select nome, ativo, slug from tenants where id = $1`,
        [res!.tenant_id],
      );
      const papeis = await tx.consultar<{ papel: string }>(
        `select papel::text as papel from membros_tenant where tenant_id = $1 and usuario_id = $2`,
        [res!.tenant_id, U.cliente],
      );
      const profs = await contar(tx, `select 1 from profissionais where tenant_id = $1`, [res!.tenant_id]);
      const profsDela = await contar(tx, `select 1 from profissionais where usuario_id = $1`, [U.cliente]);
      return { res: res!, tenant, papeis, profs, profsDela };
    });
    expect(r.res.slug).toBe('espaco-aurora');
    expect(r.tenant).toHaveLength(1);
    expect(r.tenant[0]!.nome).toBe('Espaço Aurora');
    expect(r.tenant[0]!.ativo).toBe(true);
    expect(r.papeis.map((p) => p.papel)).toEqual(['admin']);
    expect(r.profs).toBe(0);
    expect(r.profsDela).toBe(0);
  });

  it('D28: usuário novo sem vínculo também consegue criar empresa (modo equipe)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await criarUsuario(tx, 1, 'Paula Nova');
      await tx.trocarPara(id);
      const [res] = await cadastrar(tx, 'Studio Paula', 'studio-paula', false);
      await tx.trocarPara('postgres');
      const n = await contar(tx, `select 1 from membros_tenant where tenant_id = $1 and usuario_id = $2 and papel = 'admin'`, [
        res!.tenant_id,
        id,
      ]);
      return { res: res!, n };
    });
    expect(r.res.slug).toBe('studio-paula');
    expect(r.n).toBe(1);
  });

  it('D41: modo sozinho com especialidade "Manicure" cria também a linha ativa em profissionais com repasse 0', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const [res] = await cadastrar(tx, 'Unhas da Carla', 'unhas-da-carla', true, 'Manicure');
      await tx.trocarPara('postgres');
      const profs = await tx.consultar<{ especialidade: string; ativo: boolean; percentual_repasse: number; usuario_id: string }>(
        `select especialidade, ativo, percentual_repasse, usuario_id from profissionais where tenant_id = $1`,
        [res!.tenant_id],
      );
      const admin = await contar(tx, `select 1 from membros_tenant where tenant_id = $1 and usuario_id = $2 and papel = 'admin'`, [
        res!.tenant_id,
        U.cliente,
      ]);
      return { profs, admin };
    });
    expect(r.admin).toBe(1);
    expect(r.profs).toHaveLength(1);
    expect(r.profs[0]!.usuario_id).toBe(U.cliente);
    expect(r.profs[0]!.especialidade).toBe('Manicure');
    expect(r.profs[0]!.ativo).toBe(true);
    expect(Number(r.profs[0]!.percentual_repasse)).toBe(0);
  });

  it('D41: modo sozinho sem especialidade (nula, vazia) ou com 1 caractere dá ESPECIALIDADE_OBRIGATORIA', async () => {
    const msgs = await banco.comoUsuario(U.cliente, async (tx) => {
      const a = await falha(tx, () => cadastrar(tx, 'Sem Esp', 'sem-esp', true, null));
      const b = await falha(tx, () => cadastrar(tx, 'Sem Esp', 'sem-esp', true, ''));
      const c = await falha(tx, () => cadastrar(tx, 'Sem Esp', 'sem-esp', true, 'A'));
      return [a.mensagem, b.mensagem, c.mensagem];
    });
    for (const m of msgs) expect(m).toContain('ESPECIALIDADE_OBRIGATORIA');
  });

  it('D28/D30: slug já usado ("clinica-serena") não falha e o tenant sai como "clinica-serena-2"', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const [res] = await cadastrar(tx, 'Outra Serena', 'clinica-serena', false);
      await tx.trocarPara('postgres');
      const [t] = await tx.consultar<{ slug: string }>(`select slug from tenants where id = $1`, [res!.tenant_id]);
      return { res: res!, slug: t!.slug };
    });
    expect(r.res.slug).toBe('clinica-serena-2');
    expect(r.slug).toBe('clinica-serena-2');
  });

  it('D28/D30: se "clinica-serena-2" também existe, o próximo é "clinica-serena-3"', async () => {
    const slug = await banco.comoSuperusuario(async (tx) => {
      const u1 = await criarUsuario(tx, 1, 'Usuario Um');
      const u2 = await criarUsuario(tx, 2, 'Usuario Dois');
      await tx.trocarPara(u1);
      const [a] = await cadastrar(tx, 'Serena Dois', 'clinica-serena', false);
      expect(a!.slug).toBe('clinica-serena-2');
      await tx.trocarPara(u2);
      const [b] = await cadastrar(tx, 'Serena Tres', 'clinica-serena', false);
      return b!.slug;
    });
    expect(slug).toBe('clinica-serena-3');
  });

  it('D30: slug de 60 caracteres em colisão continua com no máximo 60 caracteres, sem hífen duplo nem final', async () => {
    // posição 58 é hífen: o corte para abrir espaço ao sufixo poderia deixar hífen duplo ou final
    const longo = `${'a'.repeat(57)}-bb`;
    expect(longo).toHaveLength(60);
    const r = await banco.comoSuperusuario(async (tx) => {
      const u1 = await criarUsuario(tx, 1, 'Usuario Um');
      const u2 = await criarUsuario(tx, 2, 'Usuario Dois');
      await tx.trocarPara(u1);
      const [a] = await cadastrar(tx, 'Longa Um', longo, false);
      await tx.trocarPara(u2);
      const [b] = await cadastrar(tx, 'Longa Dois', longo, false);
      return { a: a!.slug, b: b!.slug };
    });
    expect(r.a).toBe(longo);
    expect(r.b).not.toBe(longo);
    expect(r.b.length).toBeLessThanOrEqual(60);
    expect(r.b).not.toContain('--');
    expect(r.b.endsWith('-')).toBe(false);
    expect(r.b).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(r.b.endsWith('-2')).toBe(true);
  });

  it('D28: slug inválido (maiúscula, espaço, menos de 3 caracteres, hífen no início) dá SLUG_INVALIDO', async () => {
    const msgs = await banco.comoUsuario(U.cliente, async (tx) => {
      const lista: string[] = [];
      for (const slug of ['Clinica', 'clinica nova', 'ab', '-clinica']) {
        lista.push((await falha(tx, () => cadastrar(tx, 'Nome Valido', slug, false))).mensagem);
      }
      return lista;
    });
    expect(msgs).toHaveLength(4);
    for (const m of msgs) expect(m).toContain('SLUG_INVALIDO');
  });

  it('D44: os 13 slugs reservados dão SLUG_RESERVADO e nada é gravado', async () => {
    const reservados = [
      'admin', 'auth', 'cadastro', 'clinicas', 'conta', 'entrar', 'privacidade',
      'profissional', 'recuperar-senha', 'redefinir-senha', 'super-admin', 'trocar-senha', 'api',
    ];
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const lista: string[] = [];
      for (const slug of reservados) {
        lista.push((await falha(tx, () => cadastrar(tx, 'Nome Valido', slug, false))).mensagem);
      }
      const gravados = await tx.consultar<{ n: number }>(
        `select count(*)::int as n from tenants where slug = any($1::text[])`,
        [reservados],
      );
      return { lista, n: gravados[0]?.n };
    });
    expect(r.lista).toHaveLength(13);
    for (const m of r.lista) expect(m).toContain('SLUG_RESERVADO');
    expect(r.n).toBe(0);
  });

  it('D44: variações do reservado são livres (conta-empresa, admin-2)', async () => {
    const r = await banco.comoUsuario(U.cliente, (tx) => cadastrar(tx, 'Conta', 'conta-empresa', false));
    expect(JSON.stringify(r)).toContain('conta-empresa');
  });

  it('D28: nome com menos de 2 caracteres dá DADO_INVALIDO', async () => {
    const m = await banco.comoUsuario(U.cliente, (tx) => falha(tx, () => cadastrar(tx, 'A', 'slug-valido', false)));
    expect(m.mensagem).toContain('DADO_INVALIDO');
  });

  it('D37: quem já é admin de empresa (Helena) recebe JA_ADMIN_DE_EMPRESA', async () => {
    const m = await banco.comoUsuario(U.admin, (tx) => falha(tx, () => cadastrar(tx, 'Segunda', 'segunda-empresa', false)));
    expect(m.mensagem).toContain('JA_ADMIN_DE_EMPRESA');
  });

  it('D37: cliente que criou uma empresa e tenta uma segunda recebe JA_ADMIN_DE_EMPRESA', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      await cadastrar(tx, 'Primeira', 'primeira-empresa', false);
      return falha(tx, () => cadastrar(tx, 'Segunda', 'segunda-empresa', false));
    });
    expect(r.mensagem).toContain('JA_ADMIN_DE_EMPRESA');
  });

  it('RN14/D31: quem já tem linha em profissionais (Rafael, ativo) recebe JA_PROFISSIONAL', async () => {
    const m = await banco.comoUsuario(U.cabelo, (tx) => falha(tx, () => cadastrar(tx, 'Do Rafael', 'do-rafael', false)));
    expect(m.mensagem).toContain('JA_PROFISSIONAL');
  });

  it('RN14/D31: profissional desativado também recebe JA_PROFISSIONAL', async () => {
    const m = await banco.comoSuperusuario(async (tx) => {
      await desativarProfissional(tx, P.cabelo);
      await tx.trocarPara(U.cabelo);
      return falha(tx, () => cadastrar(tx, 'Do Rafael', 'do-rafael', true, 'Cabeleireiro'));
    });
    expect(m.mensagem).toContain('JA_PROFISSIONAL');
  });

  it('D28: super admin recebe SUPER_ADMIN_SEM_EMPRESA', async () => {
    const m = await banco.comoUsuario(U.superAdmin, (tx) => falha(tx, () => cadastrar(tx, 'Da Super', 'da-super', false)));
    expect(m.mensagem).toContain('SUPER_ADMIN_SEM_EMPRESA');
  });

  it('DP3: usuário com troca_senha_obrigatoria recebe TROCA_SENHA_OBRIGATORIA', async () => {
    const m = await banco.comoSuperusuario(async (tx) => {
      const id = await criarUsuario(tx, 1, 'Provisoria');
      await tx.consultar(`update public.usuarios set troca_senha_obrigatoria = true where id = $1`, [id]);
      await tx.trocarPara(id);
      return falha(tx, () => cadastrar(tx, 'Provisoria Ltda', 'provisoria', false));
    });
    expect(m.mensagem).toContain('TROCA_SENHA_OBRIGATORIA');
  });

  it('D28: anon não executa cadastrar_empresa (permission denied) e nada é criado', async () => {
    const r = await banco.comoAnonimo(async (tx) => {
      const m = await falha(tx, () => cadastrar(tx, 'Anonima', 'anonima', false));
      await tx.trocarPara('postgres');
      const n = await contar(tx, `select 1 from tenants where slug = 'anonima'`);
      return { m, n };
    });
    expect(r.m.mensagem.toLowerCase()).toContain('permission denied');
    expect(r.n).toBe(0);
  });

  it('D28: atomicidade — falha por ESPECIALIDADE_OBRIGATORIA não deixa tenant nem vínculo gravado', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      await tx.trocarPara('postgres');
      const tenantsAntes = await contar(tx, `select 1 from tenants`);
      await tx.trocarPara(U.cliente);
      const m = await falha(tx, () => cadastrar(tx, 'Atomica', 'atomica', true, null));
      await tx.trocarPara('postgres');
      return {
        m,
        tenantsAntes,
        tenantsDepois: await contar(tx, `select 1 from tenants`),
        tenant: await contar(tx, `select 1 from tenants where slug = 'atomica'`),
        vinculos: await contar(tx, `select 1 from membros_tenant where usuario_id = $1`, [U.cliente]),
        profs: await contar(tx, `select 1 from profissionais where usuario_id = $1`, [U.cliente]),
      };
    });
    expect(r.m.mensagem).toContain('ESPECIALIDADE_OBRIGATORIA');
    expect(r.tenant).toBe(0);
    expect(r.tenantsDepois).toBe(r.tenantsAntes);
    expect(r.vinculos).toBe(0);
    expect(r.profs).toBe(0);
  });
});

// ---------- B. políticas e gatilho (D29/D43) ----------

describe('Etapa B / B: políticas e gatilho de tenants e membros_tenant', () => {
  const INSERIR_TENANT = `insert into tenants (nome, slug) values ('Invasora', 'invasora')`;

  it('D29: authenticated (inclusive super admin e admin) não faz INSERT direto em tenants', async () => {
    for (const usuario of [U.superAdmin, U.admin, U.cliente]) {
      const m = await banco.comoUsuario(usuario, (tx) => falha(tx, () => tx.consultar(INSERIR_TENANT)));
      expect(m.mensagem.toLowerCase(), usuario).toMatch(/row-level security|permission denied/);
    }
  });

  it('D29: super admin não consegue INSERT em membros_tenant', async () => {
    const m = await banco.comoUsuario(U.superAdmin, (tx) =>
      falha(tx, () =>
        tx.consultar(`insert into membros_tenant (tenant_id, usuario_id, papel) values ($1, $2, 'admin')`, [T.b, U.cliente]),
      ),
    );
    // Revisão da Etapa B (achado 11): aceitar "duplicate" mascararia a volta da política.
    expect(m.mensagem.toLowerCase()).toMatch(/row-level security|permission denied/);
  });

  it('D29: nem o admin do tenant consegue INSERT em membros_tenant', async () => {
    const m = await banco.comoUsuario(U.admin, (tx) =>
      falha(tx, () =>
        tx.consultar(`insert into membros_tenant (tenant_id, usuario_id, papel) values ($1, $2, 'admin')`, [T.a, U.cliente]),
      ),
    );
    expect(m.mensagem.toLowerCase()).toMatch(/row-level security|permission denied/);
  });

  it('D29: super admin não consegue DELETE em membros_tenant (erro ou 0 linhas) e o vínculo da Helena permanece', async () => {
    const r = await banco.comoUsuario(U.superAdmin, async (tx) => {
      let apagadas = 0;
      try {
        await falha(tx, async () => {
          const l = await tx.consultar(`delete from membros_tenant where usuario_id = $1 returning usuario_id`, [U.admin]);
          apagadas = l.length;
          if (l.length === 0) throw new Error('zero linhas');
        });
      } catch {
        // falha() lança quando a operação deu certo (sem erro); então apagadas já foi preenchido
      }
      await tx.trocarPara('postgres');
      const restantes = await contar(tx, `select 1 from membros_tenant where usuario_id = $1 and papel = 'admin'`, [U.admin]);
      return { apagadas, restantes };
    });
    expect(r.apagadas).toBe(0);
    expect(r.restantes).toBe(1);
  });

  it('D29: o próprio admin não consegue apagar o vínculo dele em membros_tenant', async () => {
    const r = await banco.comoUsuario(U.admin, async (tx) => {
      let apagadas = -1;
      let erro: string | null = null;
      const nome = 'sp_del_admin';
      await tx.executar(`savepoint ${nome}`);
      try {
        const l = await tx.consultar(`delete from membros_tenant where usuario_id = $1 returning usuario_id`, [U.admin]);
        apagadas = l.length;
        await tx.executar(`release savepoint ${nome}`);
      } catch (e) {
        erro = (e as Error).message;
        await tx.executar(`rollback to savepoint ${nome}`);
      }
      await tx.trocarPara('postgres');
      const restantes = await contar(tx, `select 1 from membros_tenant where usuario_id = $1`, [U.admin]);
      return { apagadas, erro, restantes };
    });
    expect(r.apagadas === 0 || r.erro !== null).toBe(true);
    expect(r.restantes).toBe(1);
  });

  it('D43: super admin desativa e reativa o tenant (UPDATE só de ativo)', async () => {
    const r = await banco.comoUsuario(U.superAdmin, async (tx) => {
      const off = await tx.consultar<{ ativo: boolean }>(`update tenants set ativo = false where id = $1 returning ativo`, [T.a]);
      const on = await tx.consultar<{ ativo: boolean }>(`update tenants set ativo = true where id = $1 returning ativo`, [T.a]);
      return { off, on };
    });
    expect(r.off).toHaveLength(1);
    expect(r.off[0]!.ativo).toBe(false);
    expect(r.on).toHaveLength(1);
    expect(r.on[0]!.ativo).toBe(true);
  });

  it('D43: super admin mudando nome, whatsapp, endereco ou prazo_cancelamento_min recebe CAMPO_PROTEGIDO', async () => {
    const alteracoes = [
      `nome = 'Nome trocado'`,
      `whatsapp = '5511000000000'`,
      `endereco = 'Rua Nova, 1'`,
      `prazo_cancelamento_min = 999`,
    ];
    const msgs = await banco.comoUsuario(U.superAdmin, async (tx) => {
      const lista: string[] = [];
      for (const a of alteracoes) {
        lista.push((await falha(tx, () => tx.consultar(`update tenants set ${a} where id = $1`, [T.a]))).mensagem);
      }
      return lista;
    });
    expect(msgs).toHaveLength(4);
    for (const m of msgs) expect(m).toContain('CAMPO_PROTEGIDO');
  });

  it('D43: slug é imutável para o super admin e para o admin do tenant (CAMPO_PROTEGIDO)', async () => {
    const r = await banco.comoUsuario(U.superAdmin, async (tx) => {
      const super_ = await falha(tx, () => tx.consultar(`update tenants set slug = 'outro-slug' where id = $1`, [T.a]));
      await tx.trocarPara(U.admin);
      const admin = await falha(tx, () => tx.consultar(`update tenants set slug = 'outro-slug' where id = $1`, [T.a]));
      await tx.trocarPara('postgres');
      const [t] = await tx.consultar<{ slug: string }>(`select slug from tenants where id = $1`, [T.a]);
      return { super_, admin, slug: t!.slug };
    });
    expect(r.super_.mensagem).toContain('CAMPO_PROTEGIDO');
    expect(r.admin.mensagem).toContain('CAMPO_PROTEGIDO');
    expect(r.slug).toBe('clinica-serena');
  });

  it('D43: admin do tenant edita nome, whatsapp, endereço, tema e prazo da própria clínica', async () => {
    const r = await banco.comoUsuario(U.admin, async (tx) => {
      const alt = await tx.consultar<{ nome: string; whatsapp: string; endereco: string; tema: string; prazo_cancelamento_min: number }>(
        `update tenants
            set nome = 'Serena Renovada', whatsapp = '5511988880000', endereco = 'Av. Nova, 500',
                tema = 'rose', prazo_cancelamento_min = 60
          where id = $1
          returning nome, whatsapp, endereco, tema::text as tema, prazo_cancelamento_min`,
        [T.a],
      );
      return alt;
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.nome).toBe('Serena Renovada');
    expect(r[0]!.whatsapp).toBe('5511988880000');
    expect(r[0]!.endereco).toBe('Av. Nova, 500');
    expect(r[0]!.tema).toBe('rose');
    expect(Number(r[0]!.prazo_cancelamento_min)).toBe(60);
  });

  it('D43: admin do tenant não muda ativo (CAMPO_PROTEGIDO) e o tenant continua ativo', async () => {
    const r = await banco.comoUsuario(U.admin, async (tx) => {
      const m = await falha(tx, () => tx.consultar(`update tenants set ativo = false where id = $1`, [T.a]));
      await tx.trocarPara('postgres');
      const [t] = await tx.consultar<{ ativo: boolean }>(`select ativo from tenants where id = $1`, [T.a]);
      return { m, ativo: t!.ativo };
    });
    expect(r.m.mensagem).toContain('CAMPO_PROTEGIDO');
    expect(r.ativo).toBe(true);
  });

  it('D43: um segundo admin no mesmo tenant viola índice único (23505)', async () => {
    const e = await banco.comoSuperusuario((tx) =>
      falha(tx, () =>
        tx.consultar(`insert into membros_tenant (tenant_id, usuario_id, papel) values ($1, $2, 'admin')`, [T.a, U.cliente]),
      ),
    );
    expect(e.codigo).toBe('23505');
    expect(e.mensagem.toLowerCase()).toContain('duplicate key');
  });

  it('D37: o mesmo usuário admin de dois tenants viola índice único (23505)', async () => {
    const e = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`insert into tenants (id, nome, slug) values ($1, 'Extra', 'tenant-extra')`, [
        'dddddddd-1111-4111-8111-111111111111',
      ]);
      return falha(tx, () =>
        tx.consultar(`insert into membros_tenant (tenant_id, usuario_id, papel) values ($1, $2, 'admin')`, [
          'dddddddd-1111-4111-8111-111111111111',
          U.admin,
        ]),
      );
    });
    expect(e.codigo).toBe('23505');
    expect(e.mensagem.toLowerCase()).toContain('duplicate key');
  });
});

// ---------- C. meus_clientes_atendidos ----------

describe('Etapa B / C: public.meus_clientes_atendidos', () => {
  it('D35: profissional ativo recebe os clientes das próprias conclusões (id, nome, telefone), sem repetir e sem e-mail', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const beatriz = await criarUsuario(tx, 1, 'Beatriz Souza', '11977776666');
      // Carla já tem 1 conclusão com Rafael (seed); mais uma para provar que não repete
      await criarAtendimento(tx, U.cliente, P.cabelo, 10, 'CONCLUIDO');
      await criarAtendimento(tx, beatriz, P.cabelo, 11, 'CONCLUIDO');
      const esperados = await tx.consultar<ClienteAtendido>(
        `select id, nome, telefone from usuarios where id in ($1, $2) order by id`,
        [U.cliente, beatriz],
      );
      await tx.trocarPara(U.cabelo);
      const linhas = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      return { linhas, esperados, beatriz };
    });
    expect(r.linhas).toHaveLength(2);
    const ordenadas = [...r.linhas].sort((a, b) => a.id.localeCompare(b.id));
    expect(ordenadas).toEqual(r.esperados);
    expect(r.linhas.map((l) => l.id).sort()).toEqual([U.cliente, r.beatriz].sort());
    for (const l of r.linhas) {
      expect(Object.keys(l).sort()).toEqual(['id', 'nome', 'telefone']);
      expect(l).not.toHaveProperty('email');
      expect(l.nome.length).toBeGreaterThan(0);
    }
  });

  it('D35: com o seed puro, Rafael vê só a Carla (nome Carla Mendes)', async () => {
    const linhas = await banco.comoUsuario(U.cabelo, (tx) => tx.consultar<ClienteAtendido>(MEUS_CLIENTES));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.id).toBe(U.cliente);
    expect(linhas[0]!.nome).toBe('Carla Mendes');
  });

  it('D39: profissional desativado (Rafael) continua recebendo nome e telefone dos clientes que atendeu', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const [carla] = await tx.consultar<ClienteAtendido>(`select id, nome, telefone from usuarios where id = $1`, [U.cliente]);
      await desativarProfissional(tx, P.cabelo);
      await tx.trocarPara(U.cabelo);
      const linhas = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      return { carla: carla!, linhas };
    });
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toEqual(r.carla);
    expect(r.linhas[0]!.telefone).toBeTruthy();
    expect(r.linhas[0]).not.toHaveProperty('email');
  });

  it('D35: cliente com agendamento AGENDADO, CANCELADO ou NAO_COMPARECEU (sem conclusão) não aparece', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const dani = await criarUsuario(tx, 1, 'Daniela Sem Conclusao');
      await criarAtendimento(tx, dani, P.cabelo, 40, 'AGENDADO');
      await criarAtendimento(tx, dani, P.cabelo, 41, 'CANCELADO');
      await criarAtendimento(tx, dani, P.cabelo, 42, 'NAO_COMPARECEU');
      await tx.trocarPara(U.cabelo);
      const linhas = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      return { linhas, dani };
    });
    expect(r.linhas.map((l) => l.id)).toEqual([U.cliente]);
    expect(r.linhas.map((l) => l.id)).not.toContain(r.dani);
  });

  it('D35: clientes atendidos por OUTRO profissional não aparecem (isolamento entre profissionais)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const eva = await criarUsuario(tx, 1, 'Eva da Juliana');
      await criarAtendimento(tx, eva, P.manicure, 5, 'CONCLUIDO');
      await tx.trocarPara(U.cabelo);
      const doRafael = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      await tx.trocarPara(U.manicure);
      const daJuliana = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      return { doRafael, daJuliana, eva };
    });
    expect(r.doRafael.map((l) => l.id)).toEqual([U.cliente]);
    expect(r.daJuliana.map((l) => l.id)).toEqual([r.eva]);
  });

  it('D35: cliente puro (Carla) recebe lista vazia', async () => {
    const linhas = await banco.comoUsuario(U.cliente, (tx) => tx.consultar<ClienteAtendido>(MEUS_CLIENTES));
    expect(linhas).toHaveLength(0);
  });

  it('D35/D16: admin que não atende não ganha contatos por esta RPC (lista vazia, mesmo havendo conclusões na clínica)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      // Helena (admin que também atende) não tem conclusões próprias; a clínica tem (Carla com Rafael)
      await tx.trocarPara(U.admin);
      const helena = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      await tx.trocarPara(U.adminB);
      const adminB = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      await tx.trocarPara(U.superAdmin);
      const superAdmin = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      return { helena, adminB, superAdmin };
    });
    expect(r.helena).toHaveLength(0);
    expect(r.adminB).toHaveLength(0);
    expect(r.superAdmin).toHaveLength(0);
  });

  it('D25/D39: desativado continua sem ler usuarios do cliente (e-mail protegido), agendamentos e observações', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativarProfissional(tx, P.cabelo);
      await tx.trocarPara(U.cabelo);
      const lista = await tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
      const usuario = await tx.consultar(`select id, nome, telefone, email from usuarios where id = $1`, [U.cliente]);
      const agendamentos = await tx.consultar(`select id from agendamentos`);
      const observacoes = await tx.consultar(`select * from observacoes_agendamento`);
      return { lista, usuario, agendamentos, observacoes };
    });
    expect(r.lista).toHaveLength(1);
    expect(r.usuario).toHaveLength(0);
    expect(r.agendamentos).toHaveLength(0);
    expect(r.observacoes).toHaveLength(0);
  });

  it('DP3: profissional com senha provisória recebe lista vazia', async () => {
    const linhas = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`update public.usuarios set troca_senha_obrigatoria = true where id = $1`, [U.cabelo]);
      await tx.trocarPara(U.cabelo);
      return tx.consultar<ClienteAtendido>(MEUS_CLIENTES);
    });
    expect(linhas).toHaveLength(0);
  });

  it('D35: anon não executa meus_clientes_atendidos (permission denied)', async () => {
    const m = await banco.comoAnonimo((tx) => falha(tx, () => tx.consultar(MEUS_CLIENTES)));
    expect(m.mensagem.toLowerCase()).toContain('permission denied');
  });
});
