/**
 * Testes de RLS por perfil (RN11, RN15, RN03, RN10, D16, D17, D23, D26, D27 e Storage).
 * Escritos a partir da especificação, sem ler as migrations.
 * Convenção: cada `comoX` desfaz a transação; depois de um erro, abrir outro `comoX`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { criarBanco, erroDe, IDS, type Banco, type Executor } from './apoio/banco.ts';

const U = IDS.usuarios;
const T = IDS.tenants;
const P = IDS.profissionais;
const S = IDS.servicos;
const AG = IDS.agendamentos;

const RLS_OU_PERMISSAO = /row-level security|permission denied/i;

let banco: Banco;

beforeAll(async () => {
  banco = await criarBanco();
}, 120_000);

afterAll(async () => {
  await banco.fechar();
});

// ---------- apoio ----------

function executarComo<R>(quem: string | null, fn: (tx: Executor) => Promise<R>): Promise<R> {
  return quem === null ? banco.comoAnonimo(fn) : banco.comoUsuario(quem, fn);
}

/** Lê linhas como `quem` (null = anon). Lança se houver erro. */
function ler<R>(quem: string | null, sql: string, parametros: unknown[] = []): Promise<R[]> {
  return executarComo(quem, (tx) => tx.consultar<R>(sql, parametros));
}

/** Lê linhas; se o perfil nem tiver privilégio na tabela, conta como "nenhuma linha". */
async function lerOuNegado<R>(quem: string | null, sql: string, parametros: unknown[] = []): Promise<R[]> {
  try {
    return await ler<R>(quem, sql, parametros);
  } catch (erro) {
    if (/permission denied/i.test((erro as Error).message)) return [];
    throw erro;
  }
}

async function contar(quem: string | null, tabela: string, filtro = 'true', parametros: unknown[] = []): Promise<number> {
  const r = await lerOuNegado<{ n: number }>(quem, `select count(*)::int as n from ${tabela} where ${filtro}`, parametros);
  return r[0]?.n ?? 0;
}

/** Erro esperado ao executar `sql` como `quem`. */
function erroComo(quem: string | null, sql: string, parametros: unknown[] = []): Promise<string> {
  return executarComo(quem, (tx) => erroDe(tx.consultar(sql, parametros)));
}

/** UPDATE/DELETE negado: afeta 0 linhas (ou erro de RLS/permissão). */
async function semEfeito(quem: string | null, sql: string, parametros: unknown[] = []): Promise<void> {
  const r = await executarComo(quem, async (tx) => {
    try {
      return { linhas: await tx.consultar(sql, parametros) };
    } catch (erro) {
      return { erro: (erro as Error).message };
    }
  });
  if ('erro' in r) expect(r.erro).toMatch(RLS_OU_PERMISSAO);
  else expect(r.linhas).toHaveLength(0);
}

function primeiro<R>(linhas: R[]): R {
  const l = linhas[0];
  if (l === undefined) throw new Error('Consulta sem linhas');
  return l;
}

function idsDe(linhas: { id: string }[]): string[] {
  return linhas.map((l) => l.id).sort();
}

const perfis: ReadonlyArray<readonly [string, string]> = [
  ['super admin', U.superAdmin],
  ['admin Helena', U.admin],
  ['profissional cabelo', U.cabelo],
  ['profissional manicure', U.manicure],
  ['profissional psicóloga', U.psicologa],
  ['cliente Carla', U.cliente],
  ['admin do tenant B', U.adminB],
  ['cliente do tenant B', U.clienteB],
];

/** Agendamento AGENDADO no passado (início há 1 h), criado como postgres. */
async function agendadoPassado(
  tx: Executor,
  profissionalId: string,
  servicoId: string,
  duracaoMin: number,
): Promise<string> {
  const ag = primeiro(
    await tx.consultar<{ id: string }>(
      `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
       values (gen_random_uuid(), $1, $2, $3, now() - interval '1 hour',
               now() - interval '1 hour' + make_interval(mins => $4::int), 'AGENDADO')
       returning id`,
      [T.a, U.cliente, profissionalId, duracaoMin],
    ),
  );
  await tx.consultar(`insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`, [
    T.a,
    ag.id,
    servicoId,
  ]);
  return ag.id;
}

// ---------- agendamentos: leitura ----------

describe('RN15/RN11: agendamentos (SELECT)', () => {
  it('RN15: cliente vê só os 6 agendamentos próprios do tenant A', async () => {
    const r = await ler<{ id: string }>(U.cliente, 'select id from agendamentos');
    expect(idsDe(r)).toEqual(
      [AG.concluido, AG.cancelado, AG.naoCompareceu, AG.psicoterapia, AG.simultaneoCabelo, AG.simultaneoManicure].sort(),
    );
  });

  it('RN15: profissionais veem apenas os próprios atendimentos', async () => {
    expect(idsDe(await ler(U.cabelo, 'select id from agendamentos'))).toEqual([AG.concluido, AG.simultaneoCabelo].sort());
    expect(idsDe(await ler(U.manicure, 'select id from agendamentos'))).toEqual(
      [AG.cancelado, AG.simultaneoManicure].sort(),
    );
    expect(idsDe(await ler(U.psicologa, 'select id from agendamentos'))).toEqual([AG.psicoterapia]);
  });

  it('D26/D27: admin lê TODOS os 6 agendamentos do tenant A, inclusive o da psicóloga (tabela direta)', async () => {
    const r = await ler<{ id: string }>(U.admin, 'select id from agendamentos');
    expect(r).toHaveLength(6);
    expect(idsDe(r)).toEqual(
      [AG.concluido, AG.cancelado, AG.naoCompareceu, AG.psicoterapia, AG.simultaneoCabelo, AG.simultaneoManicure].sort(),
    );
    expect(await contar(U.admin, 'agendamentos', 'id = $1', [AG.psicoterapia])).toBe(1);
  });

  it('D26: profissional NÃO lê a agenda de outro profissional (cabelo não vê a psicoterapia nem a manicure)', async () => {
    expect(await contar(U.cabelo, 'agendamentos', 'id = $1', [AG.psicoterapia])).toBe(0);
    expect(await contar(U.cabelo, 'agendamentos', 'id = $1', [AG.simultaneoManicure])).toBe(0);
    expect(await contar(U.psicologa, 'agendamentos', 'id = $1', [AG.simultaneoCabelo])).toBe(0);
  });

  it('RN15: admin e cliente do tenant A não enxergam o agendamento do tenant B', async () => {
    expect(await contar(U.admin, 'agendamentos', 'id = $1', [AG.b])).toBe(0);
    expect(await contar(U.cliente, 'agendamentos', 'id = $1', [AG.b])).toBe(0);
    expect(await contar(U.cabelo, 'agendamentos', 'tenant_id = $1', [T.b])).toBe(0);
  });

  it('RN15: adminB e clienteB veem só o agendamento do tenant B', async () => {
    expect(idsDe(await ler(U.adminB, 'select id from agendamentos'))).toEqual([AG.b]);
    expect(idsDe(await ler(U.clienteB, 'select id from agendamentos'))).toEqual([AG.b]);
    expect(idsDe(await ler(U.profB, 'select id from agendamentos'))).toEqual([AG.b]);
  });

  it('RN15: super admin não vê nada operacional (agendamentos, conclusões, observações, bloqueios, itens)', async () => {
    for (const tabela of [
      'agendamentos',
      'conclusoes',
      'observacoes_agendamento',
      'bloqueios',
      'agendamento_servicos',
      'agendamentos_admin',
    ]) {
      expect(await contar(U.superAdmin, tabela), `tabela ${tabela}`).toBe(0);
    }
  });

  it('RN15: anônimo não lê agendamentos, conclusões, observações nem a view administrativa', async () => {
    for (const tabela of [
      'agendamentos',
      'conclusoes',
      'observacoes_agendamento',
      'agendamento_servicos',
      'agendamentos_admin',
      'bloqueios',
    ]) {
      expect(await contar(null, tabela), `tabela ${tabela}`).toBe(0);
    }
  });
});

// ---------- agendamentos_admin ----------

describe('D16/D26/D27: view agendamentos_admin', () => {
  it('D27: Helena vê 6 linhas, todas com nome e telefone da cliente (nada mascarado), inclusive a psicoterapia', async () => {
    const r = await ler<{
      id: string;
      cliente_id: string | null;
      cliente_nome: string | null;
      cliente_telefone: string | null;
      profissional_id: string;
      status: string;
      inicio: Date;
    }>(U.admin, 'select * from agendamentos_admin');
    expect(r).toHaveLength(6);
    for (const linha of r) {
      expect(linha.cliente_id).toBe(U.cliente);
      expect(linha.cliente_nome).toBe('Carla Mendes');
      expect(linha.cliente_telefone).toBe('11955550000');
    }
    const psi = r.find((x) => x.id === AG.psicoterapia);
    expect(psi).toBeDefined();
    expect(psi?.profissional_id).toBe(P.psicologa);
    expect(psi?.status).toBe('AGENDADO');
    expect(psi?.inicio).toBeInstanceOf(Date);
  });

  it('D16/D27: no agendamento simultâneo do cabelo o admin vê cliente_id e nome da cliente', async () => {
    const r = await ler<{ cliente_id: string | null; cliente_nome: string | null }>(
      U.admin,
      'select cliente_id, cliente_nome from agendamentos_admin where id = $1',
      [AG.simultaneoCabelo],
    );
    expect(primeiro(r).cliente_id).toBe(U.cliente);
    expect(primeiro(r).cliente_nome).toBe('Carla Mendes');
  });

  it('D27: a view tem exatamente as colunas esperadas (sem sigiloso, e-mail nem observação)', async () => {
    const cols = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'agendamentos_admin'`,
      ),
    );
    const nomes = cols.map((c) => c.column_name).sort();
    expect(nomes).toEqual(
      [
        'id',
        'tenant_id',
        'profissional_id',
        'cliente_id',
        'cliente_nome',
        'cliente_telefone',
        'inicio',
        'fim',
        'status',
        'motivo_cancelamento',
        'criado_em',
      ].sort(),
    );
    for (const proibida of ['sigiloso', 'email', 'observacao', 'texto']) expect(nomes).not.toContain(proibida);
  });

  it('D27: o conteúdo da view não contém e-mail (nenhum valor com @)', async () => {
    const r = await ler<{ t: string }>(U.admin, 'select to_jsonb(v)::text as t from agendamentos_admin v');
    expect(r).toHaveLength(6);
    for (const l of r) expect(l.t).not.toContain('@');
  });


  it('D16/F2-03: adminB NÃO lê clienteB em usuarios, mas vê nome e telefone pela view', async () => {
    expect(await contar(U.adminB, 'usuarios', 'id = $1', [U.clienteB])).toBe(0);
    const r = await ler<{ cliente_id: string | null; cliente_nome: string | null; cliente_telefone: string | null }>(
      U.adminB,
      'select cliente_id, cliente_nome, cliente_telefone from agendamentos_admin',
    );
    expect(r).toHaveLength(1);
    expect(primeiro(r).cliente_id).toBe(U.clienteB);
    expect(primeiro(r).cliente_nome).not.toBeNull();
    const esperado = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ nome: string; telefone: string | null }>('select nome, telefone from usuarios where id = $1', [U.clienteB]),
    );
    expect(primeiro(r).cliente_nome).toBe(primeiro(esperado).nome);
    expect(primeiro(r).cliente_telefone).toBe(primeiro(esperado).telefone);
  });

  it('RN15: a view não vaza linhas de outro tenant', async () => {
    const a = await ler<{ tenant_id: string }>(U.admin, 'select tenant_id from agendamentos_admin');
    expect(a.every((l) => l.tenant_id === T.a)).toBe(true);
    const b = await ler<{ tenant_id: string }>(U.adminB, 'select tenant_id from agendamentos_admin');
    expect(b.every((l) => l.tenant_id === T.b)).toBe(true);
  });

  it('RN15: quem não é admin vê 0 linhas na view (cliente, profissionais, clienteB, profB)', async () => {
    for (const quem of [U.cliente, U.cabelo, U.manicure, U.psicologa, U.clienteB, U.profB]) {
      expect(await contar(quem, 'agendamentos_admin'), quem).toBe(0);
    }
  });

  it('RN11: a view não tem coluna de observação', async () => {
    const cols = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'agendamentos_admin'`,
      ),
    );
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) expect(c.column_name).not.toMatch(/observ|texto|nota/i);
  });
});

// ---------- observações (RN11) ----------

describe('RN11: observacoes_agendamento', () => {
  it('RN11: admin (Helena) NÃO lê nenhuma observação (nem da psicoterapia nem do simultaneoCabelo)', async () => {
    expect(await contar(U.admin, 'observacoes_agendamento')).toBe(0);
    expect(await contar(U.admin, 'observacoes_agendamento', 'agendamento_id = $1', [AG.psicoterapia])).toBe(0);
    expect(await contar(U.admin, 'observacoes_agendamento', 'agendamento_id = $1', [AG.simultaneoCabelo])).toBe(0);
  });

  it('RN11/D27: admin não alcança a observação por JOIN com agendamentos nem com a view', async () => {
    const viaTabela = await ler(
      U.admin,
      `select o.texto from agendamentos a join observacoes_agendamento o on o.agendamento_id = a.id`,
    );
    expect(viaTabela).toHaveLength(0);
    const viaView = await ler(
      U.admin,
      `select o.texto from agendamentos_admin v join observacoes_agendamento o on o.agendamento_id = v.id`,
    );
    expect(viaView).toHaveLength(0);
  });

  it('RN11/D27: subconsulta/embed da observação devolve NULL para o admin em todos os agendamentos', async () => {
    const r = await ler<{ id: string; texto: string | null }>(
      U.admin,
      `select a.id, (select o.texto from observacoes_agendamento o where o.agendamento_id = a.id limit 1) as texto
         from agendamentos a`,
    );
    expect(r).toHaveLength(6);
    for (const l of r) expect(l.texto).toBeNull();
  });

  it('RN11/D27: a linha serializada de agendamentos e da view, para o admin, não carrega o texto da observação', async () => {
    const t = await ler<{ t: string }>(U.admin, 'select to_jsonb(a)::text as t from agendamentos a');
    for (const l of t) expect(l.t).not.toContain('ansiedade');
    const v = await ler<{ t: string }>(U.admin, 'select to_jsonb(v)::text as t from agendamentos_admin v');
    for (const l of v) expect(l.t).not.toContain('ansiedade');
  });

  it('RN11: admin não escreve observação (INSERT negado; UPDATE/DELETE com 0 linhas) para o atendimento da psicóloga', async () => {
    await semEfeito(U.admin, `update observacoes_agendamento set texto = 'x' where agendamento_id = $1 returning agendamento_id`, [
      AG.psicoterapia,
    ]);
    await semEfeito(U.admin, `delete from observacoes_agendamento where agendamento_id = $1 returning agendamento_id`, [
      AG.psicoterapia,
    ]);
    expect(
      await erroComo(U.admin, `insert into observacoes_agendamento (tenant_id, agendamento_id, texto) values ($1, $2, 'x')`, [
        T.a,
        AG.psicoterapia,
      ]),
    ).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN11: adminB não lê a observação do tenant B', async () => {
    expect(await contar(U.adminB, 'observacoes_agendamento')).toBe(0);
    expect(await contar(U.adminB, 'observacoes_agendamento', 'agendamento_id = $1', [AG.b])).toBe(0);
  });

  it('RN11: cliente lê as duas observações próprias', async () => {
    const r = await ler<{ agendamento_id: string; texto: string }>(U.cliente, 'select agendamento_id, texto from observacoes_agendamento');
    expect(r.map((x) => x.agendamento_id).sort()).toEqual([AG.psicoterapia, AG.simultaneoCabelo].sort());
    expect(r.find((x) => x.agendamento_id === AG.psicoterapia)?.texto).toBe('Gostaria de conversar sobre crises de ansiedade.');
  });

  it('RN11: o profissional do atendimento lê a observação; os demais não', async () => {
    expect(await contar(U.cabelo, 'observacoes_agendamento', 'agendamento_id = $1', [AG.simultaneoCabelo])).toBe(1);
    expect(await contar(U.cabelo, 'observacoes_agendamento')).toBe(1);
    const psi = await ler<{ texto: string }>(U.psicologa, 'select texto from observacoes_agendamento');
    expect(psi).toHaveLength(1);
    expect(primeiro(psi).texto).toContain('ansiedade');
    expect(await contar(U.manicure, 'observacoes_agendamento')).toBe(0);
    expect(await contar(U.cabelo, 'observacoes_agendamento', 'agendamento_id = $1', [AG.psicoterapia])).toBe(0);
    expect(await contar(U.psicologa, 'observacoes_agendamento', 'agendamento_id = $1', [AG.simultaneoCabelo])).toBe(0);
  });

  it('RN11: clienteB e profB leem a observação do tenant B; Carla e profissionais de A não', async () => {
    expect(await contar(U.clienteB, 'observacoes_agendamento')).toBe(1);
    expect(await contar(U.profB, 'observacoes_agendamento')).toBe(1);
    expect(await contar(U.cliente, 'observacoes_agendamento', 'agendamento_id = $1', [AG.b])).toBe(0);
    expect(await contar(U.cabelo, 'observacoes_agendamento', 'agendamento_id = $1', [AG.b])).toBe(0);
  });

  it('RN11: super admin e anônimo não leem observações', async () => {
    expect(await contar(U.superAdmin, 'observacoes_agendamento')).toBe(0);
    expect(await contar(null, 'observacoes_agendamento')).toBe(0);
  });

  it('RN11: admin que também atende lê a observação dos PRÓPRIOS atendimentos (papel de profissional)', async () => {
    const n = await banco.comoSuperusuario(async (tx) => {
      const ag = primeiro(
        await tx.consultar<{ id: string }>(
          `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
           values (gen_random_uuid(), $1, $2, $3, now() + interval '20 days', now() + interval '20 days 1 hour', 'AGENDADO')
           returning id`,
          [T.a, U.cliente, P.admin],
        ),
      );
      await tx.consultar(`insert into observacoes_agendamento (tenant_id, agendamento_id, texto) values ($1, $2, 'obs para Helena')`, [
        T.a,
        ag.id,
      ]);
      await tx.trocarPara(U.admin);
      const r = await tx.consultar<{ n: number }>('select count(*)::int as n from observacoes_agendamento where agendamento_id = $1', [ag.id]);
      return primeiro(r).n;
    });
    expect(n).toBe(1);
  });
});

// ---------- conclusões ----------

describe('RN05/RN15: conclusoes (SELECT)', () => {
  it('RN15: admin do tenant e profissional do atendimento leem a conclusão', async () => {
    expect(await contar(U.admin, 'conclusoes')).toBe(1);
    expect(await contar(U.cabelo, 'conclusoes')).toBe(1);
    expect(await contar(U.cabelo, 'conclusoes', 'agendamento_id = $1', [AG.concluido])).toBe(1);
  });

  it('RN15: cliente, outros profissionais, tenant B, super admin e anônimo não leem conclusões do tenant A', async () => {
    for (const quem of [U.cliente, U.manicure, U.psicologa, U.adminB, U.profB, U.clienteB, U.superAdmin, null]) {
      expect(await contar(quem, 'conclusoes', 'agendamento_id = $1', [AG.concluido]), String(quem)).toBe(0);
    }
  });

  it('D27: admin vê agendamento_servicos, a conclusão e o nome/telefone do cliente num atendimento de psicoterapia', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendadoPassado(tx, P.psicologa, S.psicoterapia, 50);
      await tx.trocarPara(U.psicologa);
      await tx.consultar(`select * from public.concluir_atendimento($1, 0, 'pix'::public.forma_pagamento)`, [id]);
      await tx.trocarPara(U.admin);
      const concl = await tx.consultar<{ valor_bruto: number }>('select valor_bruto from conclusoes where agendamento_id = $1', [id]);
      const itens = await tx.consultar<{ n: number }>('select count(*)::int as n from agendamento_servicos where agendamento_id = $1', [id]);
      const naTabela = await tx.consultar<{ n: number }>('select count(*)::int as n from agendamentos where id = $1', [id]);
      const view = await tx.consultar<{ cliente_id: string | null; cliente_nome: string | null; cliente_telefone: string | null; status: string; profissional_id: string }>(
        'select cliente_id, cliente_nome, cliente_telefone, status, profissional_id from agendamentos_admin where id = $1',
        [id],
      );
      return { concl, itens, naTabela, view };
    });
    expect(r.concl).toHaveLength(1);
    expect(primeiro(r.concl).valor_bruto).toBe(20000);
    expect(primeiro(r.itens).n).toBe(1);
    expect(primeiro(r.naTabela).n).toBe(1);
    const v = primeiro(r.view);
    expect(v.status).toBe('CONCLUIDO');
    expect(v.profissional_id).toBe(P.psicologa);
    expect(v.cliente_id).toBe(U.cliente);
    expect(v.cliente_nome).toBe('Carla Mendes');
    expect(v.cliente_telefone).toBe('11955550000');
  });

  it('D27: a psicóloga (profissional) vê o cliente e a observação do próprio atendimento', async () => {
    const r = await ler<{ cliente_id: string }>(U.psicologa, 'select cliente_id from agendamentos where id = $1', [AG.psicoterapia]);
    expect(primeiro(r).cliente_id).toBe(U.cliente);
    expect(await contar(U.psicologa, 'usuarios', 'id = $1', [U.cliente])).toBe(1);
    expect(await contar(U.psicologa, 'observacoes_agendamento', 'agendamento_id = $1', [AG.psicoterapia])).toBe(1);
  });

  it('RN05/D26: admin não altera nem apaga conclusões (UPDATE/DELETE 0 linhas) e Helena vê só a conclusão do tenant A', async () => {
    expect(await contar(U.admin, 'conclusoes', 'tenant_id = $1', [T.a])).toBe(1);
    await semEfeito(U.admin, `update conclusoes set valor_bruto = 1 where agendamento_id = $1 returning agendamento_id`, [AG.concluido]);
    await semEfeito(U.admin, `delete from conclusoes where agendamento_id = $1 returning agendamento_id`, [AG.concluido]);
  });

  it('RN03/D26: admin NÃO conclui o atendimento de outro profissional (a RPC recusa e o estado não muda)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendadoPassado(tx, P.psicologa, S.psicoterapia, 50);
      await tx.trocarPara(U.admin);
      await tx.executar('savepoint tentativa');
      const msg = await erroDe(tx.consultar(`select * from public.concluir_atendimento($1, 0, 'pix'::public.forma_pagamento)`, [id]));
      await tx.executar('rollback to savepoint tentativa');
      await tx.trocarPara('postgres');
      const st = await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [id]);
      const cl = await tx.consultar<{ n: number }>('select count(*)::int as n from conclusoes where agendamento_id = $1', [id]);
      return { msg, status: primeiro(st).status, conclusoes: primeiro(cl).n };
    });
    expect(r.msg.length).toBeGreaterThan(0);
    expect(r.msg).not.toMatch(/does not exist/i);
    expect(r.status).toBe('AGENDADO');
    expect(r.conclusoes).toBe(0);
  });
});

// ---------- escrita direta negada (só RPC) ----------

describe('RN03/RN07/RN11: escrita direta em tabelas só-RPC é negada a todos os perfis', () => {
  const insercoes: ReadonlyArray<readonly [string, string, unknown[]]> = [
    [
      'agendamentos',
      `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
       values (gen_random_uuid(), $1, $2, $3, now() + interval '30 days', now() + interval '30 days 1 hour', 'AGENDADO')`,
      [T.a, U.cliente, P.cabelo],
    ],
    [
      'agendamento_servicos',
      `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
      [T.a, AG.simultaneoCabelo, S.escova],
    ],
    [
      'observacoes_agendamento',
      `insert into observacoes_agendamento (tenant_id, agendamento_id, texto) values ($1, $2, 'forjada')`,
      [T.a, AG.simultaneoManicure],
    ],
    [
      'conclusoes',
      `insert into conclusoes (tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido, forma_pagamento, percentual_repasse, valor_clinica, valor_profissional)
       values ($1, $2, 1000, 0, 1000, 'pix', 3000, 300, 700)`,
      [T.a, AG.simultaneoManicure],
    ],
  ];

  for (const [nome, quem] of perfis) {
    for (const [tabela, sql, params] of insercoes) {
      it(`RN03: INSERT direto em ${tabela} negado para ${nome}`, async () => {
        expect(await erroComo(quem, sql, params)).toMatch(RLS_OU_PERMISSAO);
      });
    }
  }

  it('RN03: INSERT direto em agendamentos negado também para anônimo', async () => {
    expect(await erroComo(null, insercoes[0]![1], insercoes[0]![2])).toMatch(RLS_OU_PERMISSAO);
  });

  const alteracoes: ReadonlyArray<readonly [string, string, unknown[]]> = [
    ['UPDATE agendamentos (status)', `update agendamentos set status = 'CANCELADO' where id = $1 returning id`, [AG.simultaneoCabelo]],
    ['UPDATE agendamentos (horário)', `update agendamentos set inicio = inicio + interval '1 day', fim = fim + interval '1 day' where id = $1 returning id`, [AG.simultaneoManicure]],
    ['DELETE agendamentos', `delete from agendamentos where id = $1 returning id`, [AG.simultaneoCabelo]],
    ['UPDATE agendamento_servicos', `update agendamento_servicos set servico_id = $2 where agendamento_id = $1 returning agendamento_id`, [AG.simultaneoCabelo, S.escova]],
    ['DELETE agendamento_servicos', `delete from agendamento_servicos where agendamento_id = $1 returning agendamento_id`, [AG.concluido]],
    ['UPDATE observacoes_agendamento', `update observacoes_agendamento set texto = 'adulterado' where agendamento_id = $1 returning agendamento_id`, [AG.simultaneoCabelo]],
    ['DELETE observacoes_agendamento', `delete from observacoes_agendamento where agendamento_id = $1 returning agendamento_id`, [AG.psicoterapia]],
    ['UPDATE agendamentos (motivo_cancelamento)', `update agendamentos set motivo_cancelamento = 'forjado' where id = $1 returning id`, [AG.cancelado]],
    ['UPDATE agendamentos (status da psicoterapia)', `update agendamentos set status = 'CANCELADO' where id = $1 returning id`, [AG.psicoterapia]],
    ['UPDATE conclusoes', `update conclusoes set forma_pagamento = 'dinheiro' where agendamento_id = $1 returning agendamento_id`, [AG.concluido]],
    ['DELETE conclusoes', `delete from conclusoes where agendamento_id = $1 returning agendamento_id`, [AG.concluido]],
  ];

  for (const [nome, quem] of perfis) {
    for (const [rotulo, sql, params] of alteracoes) {
      it(`RN03: ${rotulo} afeta 0 linhas para ${nome}`, async () => {
        await semEfeito(quem, sql, params);
      });
    }
  }

  it('RN07: após as tentativas, a conclusão e o estado do seed continuam intactos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => ({
      c: await tx.consultar<{ forma_pagamento: string; valor_liquido: number }>(
        'select forma_pagamento, valor_liquido from conclusoes where agendamento_id = $1',
        [AG.concluido],
      ),
      a: await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [AG.simultaneoCabelo]),
    }));
    expect(primeiro(r.c).forma_pagamento).toBe('pix');
    expect(primeiro(r.c).valor_liquido).toBe(20000);
    expect(primeiro(r.a).status).toBe('AGENDADO');
  });
});

// ---------- D26/D27: admin lê a agenda, não escreve nela ----------

describe('D26/D27: o admin lê a agenda e o contato, mas não escreve na agenda nem lê e-mail', () => {
  it('D27: o esquema não tem mais servicos.sigiloso nem agendamentos.sigiloso, e tem agendamentos.motivo_cancelamento', async () => {
    const cols = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('servicos', 'agendamentos')`,
      ),
    );
    const chaves = cols.map((c) => `${c.table_name}.${c.column_name}`);
    expect(chaves).not.toContain('servicos.sigiloso');
    expect(chaves).not.toContain('agendamentos.sigiloso');
    expect(chaves).toContain('agendamentos.motivo_cancelamento');
  });

  it('D27: os 6 serviços do seed existem e nenhum é sigiloso (a psicoterapia é serviço comum)', async () => {
    expect(await contar(U.admin, 'servicos', 'tenant_id = $1', [T.a])).toBe(6);
    expect(await contar(null, 'servicos', 'id = $1', [S.psicoterapia])).toBe(1);
  });

  it('D27: adminB NÃO lê o cliente do tenant B em usuarios (e-mail oculto) e nenhum cliente em geral', async () => {
    expect(await contar(U.adminB, 'usuarios', 'id = $1', [U.clienteB])).toBe(0);
    const r = await ler<{ email: string }>(U.adminB, `select email from usuarios where id = $1`, [U.clienteB]);
    expect(r).toHaveLength(0);
    expect(await contar(U.adminB, 'usuarios', 'id = $1', [U.cliente])).toBe(0);
  });

  it('D26: admin (Helena e adminB) não insere agendamento, itens, observação nem conclusão (erro de RLS)', async () => {
    const tentativas: ReadonlyArray<readonly [string, string, unknown[]]> = [
      [
        'agendamentos',
        `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
         values (gen_random_uuid(), $1, $2, $3, now() + interval '31 days', now() + interval '31 days 1 hour', 'AGENDADO')`,
        [T.a, U.cliente, P.cabelo],
      ],
      [
        'agendamento_servicos',
        `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
        [T.a, AG.simultaneoCabelo, S.escova],
      ],
      [
        'observacoes_agendamento',
        `insert into observacoes_agendamento (tenant_id, agendamento_id, texto) values ($1, $2, 'x')`,
        [T.a, AG.simultaneoManicure],
      ],
      [
        'conclusoes',
        `insert into conclusoes (tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido, forma_pagamento, percentual_repasse, valor_clinica, valor_profissional)
         values ($1, $2, 1000, 0, 1000, 'pix', 3000, 300, 700)`,
        [T.a, AG.simultaneoManicure],
      ],
    ];
    for (const quem of [U.admin, U.adminB]) {
      for (const [tabela, sql, params] of tentativas) {
        expect(await erroComo(quem, sql, params), `${tabela} ${quem}`).toMatch(RLS_OU_PERMISSAO);
      }
    }
  });

  it('D26: admin não cancela, remarca nem apaga agendamentos (0 linhas) e o estado do seed fica intacto', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.trocarPara(U.admin);
      const cancelar = await tx.consultar(`update agendamentos set status = 'CANCELADO' where id = $1 returning id`, [AG.simultaneoCabelo]);
      const remarcar = await tx.consultar(
        `update agendamentos set inicio = inicio + interval '1 day', fim = fim + interval '1 day' where id = $1 returning id`,
        [AG.psicoterapia],
      );
      const apagar = await tx.consultar(`delete from agendamentos where id = $1 returning id`, [AG.simultaneoManicure]);
      await tx.trocarPara('postgres');
      const st = await tx.consultar<{ id: string; status: string }>(
        `select id, status from agendamentos where id in ($1, $2, $3)`,
        [AG.simultaneoCabelo, AG.psicoterapia, AG.simultaneoManicure],
      );
      return { cancelar, remarcar, apagar, st };
    });
    expect(r.cancelar).toHaveLength(0);
    expect(r.remarcar).toHaveLength(0);
    expect(r.apagar).toHaveLength(0);
    expect(r.st).toHaveLength(3);
    for (const l of r.st) expect(l.status).toBe('AGENDADO');
  });

  it('D26: admin continua editando serviços, profissionais (%, especialidade, ativo) e o tenant (tema, prazo)', async () => {
    const r = await banco.comoUsuario(U.admin, async (tx) => ({
      servico: await tx.consultar(`update servicos set preco = 17000 where id = $1 returning id`, [S.corte]),
      prof: await tx.consultar(
        `update profissionais set percentual_repasse = 4000, especialidade = 'Colorista' where id = $1 returning id`,
        [P.manicure],
      ),
      tenant: await tx.consultar(`update tenants set prazo_cancelamento_min = 60, tema = tema where id = $1 returning id`, [T.a]),
    }));
    expect(r.servico).toHaveLength(1);
    expect(r.prof).toHaveLength(1);
    expect(r.tenant).toHaveLength(1);
  });
});

// ---------- usuarios ----------

describe('RN15/D16: usuarios', () => {
  it('D16: cada perfil lê a própria linha', async () => {
    for (const [nome, quem] of perfis) {
      expect(await contar(quem, 'usuarios', 'id = $1', [quem]), nome).toBe(1);
    }
  });

  it('D16: cliente lê só a própria linha (não vê profissionais nem admin)', async () => {
    expect(idsDe(await ler(U.cliente, 'select id from usuarios'))).toEqual([U.cliente]);
    expect(idsDe(await ler(U.clienteB, 'select id from usuarios'))).toEqual([U.clienteB]);
  });

  it('D16: profissional lê a si mesmo e os clientes dos próprios atendimentos', async () => {
    expect(idsDe(await ler(U.cabelo, 'select id from usuarios'))).toEqual([U.cabelo, U.cliente].sort());
    expect(idsDe(await ler(U.manicure, 'select id from usuarios'))).toEqual([U.manicure, U.cliente].sort());
    expect(idsDe(await ler(U.psicologa, 'select id from usuarios'))).toEqual([U.psicologa, U.cliente].sort());
    expect(idsDe(await ler(U.profB, 'select id from usuarios'))).toEqual([U.profB, U.clienteB].sort());
  });

  it('D16/D27: Helena lê os profissionais do tenant e Carla SÓ porque atendeu Carla como profissional (P.admin); nada do tenant B', async () => {
    const r = idsDe(await ler(U.admin, 'select id from usuarios'));
    expect(r).toEqual([U.admin, U.cabelo, U.manicure, U.psicologa, U.cliente].sort());
    for (const b of [U.adminB, U.profB, U.clienteB]) expect(r).not.toContain(b);
  });

  it('D16: adminB lê a si mesmo e a profB, mas NÃO clienteB nem usuários do tenant A', async () => {
    expect(idsDe(await ler(U.adminB, 'select id from usuarios'))).toEqual([U.adminB, U.profB].sort());
  });

  it('RN15: super admin lê os admins dos tenants, mas não clientes nem profissionais', async () => {
    const r = idsDe(await ler(U.superAdmin, 'select id from usuarios'));
    expect(r).toContain(U.superAdmin);
    expect(r).toContain(U.admin);
    expect(r).toContain(U.adminB);
    for (const nao of [U.cliente, U.clienteB, U.cabelo, U.manicure, U.psicologa, U.profB]) expect(r).not.toContain(nao);
  });

  it('RN15: anônimo não lê usuarios (erro de permissão)', async () => {
    expect(await erroComo(null, 'select id from usuarios')).toMatch(/permission denied/i);
  });

  it('D16: o usuário atualiza nome e telefone próprios', async () => {
    const r = await ler<{ nome: string; telefone: string }>(
      U.cliente,
      `update usuarios set nome = 'Carla Nova', telefone = '11900000000' where id = $1 returning nome, telefone`,
      [U.cliente],
    );
    expect(primeiro(r)).toEqual({ nome: 'Carla Nova', telefone: '11900000000' });
  });

  it('D16: não atualiza outro usuário (0 linhas)', async () => {
    await semEfeito(U.cliente, `update usuarios set nome = 'Hack' where id = $1 returning id`, [U.admin]);
    await semEfeito(U.cabelo, `update usuarios set telefone = '0' where id = $1 returning id`, [U.cliente]);
    await semEfeito(U.admin, `update usuarios set nome = 'Hack' where id = $1 returning id`, [U.cliente]);
    await semEfeito(U.adminB, `update usuarios set nome = 'Hack' where id = $1 returning id`, [U.clienteB]);
  });

  it('RN15: não muda super_admin próprio (escalada de privilégio) — CAMPO_PROTEGIDO', async () => {
    for (const quem of [U.cliente, U.admin, U.cabelo]) {
      expect(await erroComo(quem, `update usuarios set super_admin = true where id = $1`, [quem])).toContain('CAMPO_PROTEGIDO');
    }
  });

  it('RN15: não muda o e-mail — CAMPO_PROTEGIDO', async () => {
    expect(await erroComo(U.cliente, `update usuarios set email = 'outro@example.com' where id = $1`, [U.cliente])).toContain('CAMPO_PROTEGIDO');
  });

  it('RN15: não consegue criar linha em usuarios (forjar super admin)', async () => {
    const msg = await erroComo(
      U.cliente,
      `insert into usuarios (id, nome, email, super_admin) values (gen_random_uuid(), 'Forjado', 'forjado@example.com', true)`,
    );
    expect(msg.length).toBeGreaterThan(0);
  });

  it('RN15: DELETE em usuarios afeta 0 linhas', async () => {
    await semEfeito(U.cliente, `delete from usuarios where id = $1 returning id`, [U.cliente]);
    await semEfeito(U.admin, `delete from usuarios where id = $1 returning id`, [U.cabelo]);
  });
});

// ---------- membros_tenant ----------

describe('RN15: membros_tenant', () => {
  const insercaoMembro = `insert into membros_tenant (tenant_id, usuario_id, papel) values ($1, $2, 'admin')`;

  it('RN15: cliente não se promove a admin do tenant', async () => {
    expect(await erroComo(U.cliente, insercaoMembro, [T.a, U.cliente])).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: profissional não se promove a admin do tenant', async () => {
    expect(await erroComo(U.cabelo, insercaoMembro, [T.a, U.cabelo])).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: admin do tenant B não cria admin no tenant A', async () => {
    expect(await erroComo(U.adminB, insercaoMembro, [T.a, U.adminB])).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: adminB não lê membros do tenant A', async () => {
    expect(await contar(U.adminB, 'membros_tenant', 'tenant_id = $1', [T.a])).toBe(0);
  });

  it('RN15: cliente não apaga nem altera membros', async () => {
    await semEfeito(U.cliente, `delete from membros_tenant where tenant_id = $1 returning usuario_id`, [T.a]);
    await semEfeito(U.cabelo, `update membros_tenant set usuario_id = $2 where tenant_id = $1 returning usuario_id`, [T.a, U.cabelo]);
  });
});

// ---------- tenants ----------

describe('RN15/D23: tenants', () => {
  it('RN15: anônimo vê tenants ativos (A e B)', async () => {
    const r = await ler<{ id: string }>(null, 'select id from tenants');
    expect(idsDe(r)).toEqual([T.a, T.b].sort());
  });

  it('D23: tenant desativado some da vitrine anônima e de profissionais_publicos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set ativo = false where id = '${T.a}'`);
      await tx.trocarPara(null);
      return {
        tenants: await tx.consultar<{ id: string }>('select id from tenants'),
        pubs: await tx.consultar<{ id: string }>('select id from profissionais_publicos where tenant_id = $1', [T.a]),
      };
    });
    expect(idsDe(r.tenants)).toEqual([T.b]);
    expect(r.pubs).toHaveLength(0);
  });

  it('D23: agendamentos futuros do tenant desativado continuam existindo', async () => {
    const n = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set ativo = false where id = '${T.a}'`);
      const r = await tx.consultar<{ n: number }>(
        `select count(*)::int as n from agendamentos where tenant_id = $1 and status = 'AGENDADO' and inicio > now()`,
        [T.a],
      );
      return primeiro(r).n;
    });
    expect(n).toBe(3);
  });

  it('RN15: anônimo não insere nem altera tenants', async () => {
    expect((await erroComo(null, `insert into tenants (id, nome, slug) values (gen_random_uuid(), 'X', 'x-anon')`)).length).toBeGreaterThan(0);
    await semEfeito(null, `update tenants set nome = 'Hack' returning id`);
  });

  it('RN15: admin atualiza nome e prazo do próprio tenant (e tema)', async () => {
    const r = await ler<{ nome: string; prazo_cancelamento_min: number }>(
      U.admin,
      `update tenants set nome = 'Clínica Serena Nova', prazo_cancelamento_min = 240, tema = tema where id = $1 returning nome, prazo_cancelamento_min`,
      [T.a],
    );
    expect(primeiro(r)).toEqual({ nome: 'Clínica Serena Nova', prazo_cancelamento_min: 240 });
  });

  it('RN15: admin NÃO altera slug — CAMPO_PROTEGIDO', async () => {
    expect(await erroComo(U.admin, `update tenants set slug = 'novo-slug' where id = $1`, [T.a])).toContain('CAMPO_PROTEGIDO');
  });

  it('RN15: admin NÃO altera ativo — CAMPO_PROTEGIDO', async () => {
    expect(await erroComo(U.admin, `update tenants set ativo = false where id = $1`, [T.a])).toContain('CAMPO_PROTEGIDO');
  });

  it('RN15: admin A não atualiza o tenant B (0 linhas)', async () => {
    await semEfeito(U.admin, `update tenants set nome = 'Invadido' where id = $1 returning id`, [T.b]);
    await semEfeito(U.adminB, `update tenants set nome = 'Invadido' where id = $1 returning id`, [T.a]);
  });

  it('RN15: profissional e cliente não atualizam o tenant (0 linhas)', async () => {
    await semEfeito(U.cabelo, `update tenants set nome = 'Hack' where id = $1 returning id`, [T.a]);
    await semEfeito(U.cliente, `update tenants set nome = 'Hack' where id = $1 returning id`, [T.a]);
  });

  it('RN15: Super Admin insere tenant e altera ativo e slug', async () => {
    const r = await banco.comoUsuario(U.superAdmin, async (tx) => {
      const novo = await tx.consultar<{ id: string }>(
        `insert into tenants (id, nome, slug, tema)
         select gen_random_uuid(), 'Nova Clínica', 'nova-clinica', tema from tenants where id = $1 returning id`,
        [T.a],
      );
      const id = primeiro(novo).id;
      const alt = await tx.consultar<{ ativo: boolean; slug: string }>(
        `update tenants set ativo = false, slug = 'nova-clinica-2' where id = $1 returning ativo, slug`,
        [id],
      );
      return primeiro(alt);
    });
    expect(r).toEqual({ ativo: false, slug: 'nova-clinica-2' });
  });

  it('RN15: Super Admin lê todos os tenants, inclusive inativos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set ativo = false where id = '${T.b}'`);
      await tx.trocarPara(U.superAdmin);
      return tx.consultar<{ id: string }>('select id from tenants');
    });
    expect(idsDe(r)).toEqual([T.a, T.b].sort());
  });

  it('RN15: cliente e profissional não inserem tenant (erro RLS)', async () => {
    const sql = `insert into tenants (id, nome, slug) values (gen_random_uuid(), 'X', 'x-intruso')`;
    expect(await erroComo(U.cliente, sql)).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.cabelo, sql)).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.admin, sql)).toMatch(RLS_OU_PERMISSAO);
  });
});

// ---------- profissionais / servicos / vínculos ----------

describe('RN10/RN15/D17: profissionais, servicos e profissional_servicos', () => {
  it('RN10: admin altera o percentual de repasse de um profissional do próprio tenant', async () => {
    const r = await ler<{ percentual_repasse: number }>(
      U.admin,
      `update profissionais set percentual_repasse = 3500 where id = $1 returning percentual_repasse`,
      [P.cabelo],
    );
    expect(primeiro(r).percentual_repasse).toBe(3500);
  });

  it('RN10: profissional NÃO altera o próprio percentual_repasse (0 linhas)', async () => {
    await semEfeito(U.cabelo, `update profissionais set percentual_repasse = 0 where id = $1 returning id`, [P.cabelo]);
    const pb = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ percentual_repasse: number }>('select percentual_repasse from profissionais where id = $1', [P.cabelo]),
    );
    expect(primeiro(pb).percentual_repasse).toBe(3000);
  });

  it('RN10: profissional não altera percentual de colega, nem cliente, nem admin de outro tenant', async () => {
    await semEfeito(U.cabelo, `update profissionais set percentual_repasse = 0 where id = $1 returning id`, [P.manicure]);
    await semEfeito(U.cliente, `update profissionais set percentual_repasse = 0 where id = $1 returning id`, [P.cabelo]);
    await semEfeito(U.adminB, `update profissionais set percentual_repasse = 0 where id = $1 returning id`, [P.cabelo]);
    await semEfeito(U.superAdmin, `update profissionais set percentual_repasse = 0 where id = $1 returning id`, [P.cabelo]);
  });

  it('RN10 (exploratório): cliente e anônimo não leem percentual_repasse (matriz: só o profissional vê o seu)', async () => {
    for (const quem of [U.cliente, null]) {
      const r = await lerOuNegado<{ percentual_repasse: number }>(quem, 'select percentual_repasse from profissionais');
      expect(r, String(quem)).toHaveLength(0);
    }
  });

  it('RN10 (exploratório): profissional não lê o percentual de colegas', async () => {
    const r = await lerOuNegado<{ id: string }>(U.cabelo, 'select id from profissionais where id <> $1', [P.cabelo]);
    expect(r).toHaveLength(0);
  });

  it('RN15: adminB e clienteB não leem profissionais do tenant A', async () => {
    expect(await contar(U.adminB, 'profissionais', 'tenant_id = $1', [T.a])).toBe(0);
    expect(await contar(U.clienteB, 'profissionais', 'tenant_id = $1', [T.a])).toBe(0);
    expect(await contar(U.admin, 'profissionais', 'tenant_id = $1', [T.b])).toBe(0);
  });

  it('RN15: anônimo e autenticado leem profissionais_publicos (4 em A) sem e-mail nem telefone', async () => {
    expect(await contar(null, 'profissionais_publicos', 'tenant_id = $1', [T.a])).toBe(4);
    expect(await contar(U.cliente, 'profissionais_publicos', 'tenant_id = $1', [T.a])).toBe(4);
    const cols = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profissionais_publicos'`,
      ),
    );
    const nomes = cols.map((c) => c.column_name);
    expect(nomes).not.toContain('email');
    expect(nomes).not.toContain('telefone');
    expect(nomes).not.toContain('percentual_repasse');
    expect(nomes).not.toContain('usuario_id');
  });

  it('RN15: profissionais_publicos só mostra tenants ativos', async () => {
    const n = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set ativo = false where id = '${T.a}'`);
      await tx.trocarPara(U.cliente);
      const r = await tx.consultar<{ n: number }>('select count(*)::int as n from profissionais_publicos where tenant_id = $1', [T.a]);
      return primeiro(r).n;
    });
    expect(n).toBe(0);
  });

  it('RN15: admin cria servico no próprio tenant', async () => {
    const r = await ler<{ id: string }>(
      U.admin,
      `insert into servicos (id, tenant_id, nome, duracao_min, preco) values (gen_random_uuid(), $1, 'Hidratação', 30, 5000) returning id`,
      [T.a],
    );
    expect(r).toHaveLength(1);
  });

  it('RN15: admin A não cria servico nem profissional no tenant B (erro RLS)', async () => {
    expect(
      await erroComo(U.admin, `insert into servicos (id, tenant_id, nome, duracao_min, preco) values (gen_random_uuid(), $1, 'X', 30, 100)`, [T.b]),
    ).toMatch(RLS_OU_PERMISSAO);
    expect(
      await erroComo(
        U.admin,
        `insert into profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse) values (gen_random_uuid(), $1, $2, 'x', 1000)`,
        [T.b, U.clienteB],
      ),
    ).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: profissional e cliente não criam servico nem profissional', async () => {
    const sql = `insert into servicos (id, tenant_id, nome, duracao_min, preco) values (gen_random_uuid(), $1, 'X', 30, 100)`;
    expect(await erroComo(U.cabelo, sql, [T.a])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.cliente, sql, [T.a])).toMatch(RLS_OU_PERMISSAO);
    expect(
      await erroComo(
        U.cabelo,
        `insert into profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse) values (gen_random_uuid(), $1, $2, 'x', 1000)`,
        [T.a, U.clienteB],
      ),
    ).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: profissional não altera preço de serviço (0 linhas); admin altera', async () => {
    await semEfeito(U.cabelo, `update servicos set preco = 1 where id = $1 returning id`, [S.corte]);
    await semEfeito(U.cliente, `update servicos set preco = 1 where id = $1 returning id`, [S.corte]);
    await semEfeito(U.adminB, `update servicos set preco = 1 where id = $1 returning id`, [S.corte]);
    const r = await ler<{ preco: number }>(U.admin, `update servicos set preco = 16000 where id = $1 returning preco`, [S.corte]);
    expect(primeiro(r).preco).toBe(16000);
  });

  it('RN15: anônimo lê os 6 serviços do tenant A (vitrine)', async () => {
    expect(await contar(null, 'servicos', 'tenant_id = $1', [T.a])).toBe(6);
  });

  it('RN15: admin cria vínculo profissional↔serviço; cabelo, cliente e adminB não', async () => {
    const ok = await ler<{ servico_id: string }>(
      U.admin,
      `insert into profissional_servicos (tenant_id, profissional_id, servico_id) values ($1, $2, $3) returning servico_id`,
      [T.a, P.admin, S.corte],
    );
    expect(ok).toHaveLength(1);
    const sql = `insert into profissional_servicos (tenant_id, profissional_id, servico_id) values ($1, $2, $3)`;
    expect(await erroComo(U.cabelo, sql, [T.a, P.cabelo, S.pedicure])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.cliente, sql, [T.a, P.cabelo, S.pedicure])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.adminB, sql, [T.a, P.cabelo, S.pedicure])).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: admin A não cria vínculo no tenant B; vínculo de B não é apagável por A', async () => {
    expect(
      await erroComo(U.admin, `insert into profissional_servicos (tenant_id, profissional_id, servico_id) values ($1, $2, $3)`, [
        T.b,
        P.b,
        S.reflexologiaB,
      ]),
    ).toMatch(RLS_OU_PERMISSAO);
    await semEfeito(U.admin, `delete from profissional_servicos where tenant_id = $1 returning servico_id`, [T.b]);
    await semEfeito(U.cabelo, `delete from profissional_servicos where profissional_id = $1 returning servico_id`, [P.cabelo]);
  });

  it('D17: excluir serviço com histórico falha (FK); sem histórico funciona', async () => {
    expect(await erroComo(U.admin, `delete from servicos where id = $1`, [S.corte])).toMatch(/foreign key|violates|23503/i);
    const r = await banco.comoUsuario(U.admin, async (tx) => {
      const novo = await tx.consultar<{ id: string }>(
        `insert into servicos (id, tenant_id, nome, duracao_min, preco) values (gen_random_uuid(), $1, 'Temporário', 30, 100) returning id`,
        [T.a],
      );
      return tx.consultar<{ id: string }>('delete from servicos where id = $1 returning id', [primeiro(novo).id]);
    });
    expect(r).toHaveLength(1);
  });

  it('D17: excluir profissional com histórico falha (FK); sem histórico funciona', async () => {
    expect(await erroComo(U.admin, `delete from profissionais where id = $1`, [P.cabelo])).toMatch(/foreign key|violates|23503/i);
    const r = await banco.comoSuperusuario(async (tx) => {
      const novo = await tx.consultar<{ id: string }>(
        `insert into profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse)
         values (gen_random_uuid(), $1, $2, 'teste', 1000) returning id`,
        [T.a, U.clienteB],
      );
      await tx.trocarPara(U.admin);
      return tx.consultar<{ id: string }>('delete from profissionais where id = $1 returning id', [primeiro(novo).id]);
    });
    expect(r).toHaveLength(1);
  });
});

// ---------- horários e bloqueios ----------

describe('RN12/RN15: horarios_atendimento e bloqueios', () => {
  const novoHorario = (dia: number) =>
    `insert into horarios_atendimento (id, tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
     values (gen_random_uuid(), $1, $2, ${dia}, '09:00', '12:00') returning id`;
  const novoBloqueio = `insert into bloqueios (id, tenant_id, profissional_id, inicio, fim, motivo)
     values (gen_random_uuid(), $1, $2, now() + interval '40 days', now() + interval '40 days 1 hour', 'Folga') returning id`;

  it('RN12: anônimo lê horários de atendimento, mas não bloqueios', async () => {
    expect(await contar(null, 'horarios_atendimento', 'tenant_id = $1', [T.a])).toBeGreaterThan(0);
    expect(await contar(null, 'bloqueios')).toBe(0);
  });

  it('RN15: admin vê o bloqueio da psicóloga; adminB não; super admin não', async () => {
    expect(await contar(U.admin, 'bloqueios', 'profissional_id = $1', [P.psicologa])).toBe(1);
    expect(await contar(U.adminB, 'bloqueios', 'tenant_id = $1', [T.a])).toBe(0);
    expect(await contar(U.superAdmin, 'bloqueios')).toBe(0);
  });

  it('D26: o admin LÊ horários e bloqueios do próprio tenant (e nada do tenant B)', async () => {
    expect(await contar(U.admin, 'horarios_atendimento', 'profissional_id = $1', [P.manicure])).toBeGreaterThan(0);
    // Horários de atendimento são PÚBLICOS por desenho (RF21: a vitrine precisa do expediente), então
    // o admin de outro tenant os enxerga; o que não pode vazar são os bloqueios (têm motivo).
    expect(await contar(U.admin, 'bloqueios', 'tenant_id = $1', [T.b])).toBe(0);
  });

  it('D26: o próprio profissional cria horário e bloqueio para si', async () => {
    expect(await ler(U.cabelo, novoHorario(0), [T.a, P.cabelo])).toHaveLength(1);
    expect(await ler(U.cabelo, novoBloqueio, [T.a, P.cabelo])).toHaveLength(1);
  });

  it('D26: o próprio profissional atualiza e apaga os SEUS horários e bloqueios', async () => {
    const r = await banco.comoUsuario(U.cabelo, async (tx) => {
      const h = primeiro(await tx.consultar<{ id: string }>(novoHorario(0), [T.a, P.cabelo]));
      const b = primeiro(await tx.consultar<{ id: string }>(novoBloqueio, [T.a, P.cabelo]));
      return {
        upH: await tx.consultar(`update horarios_atendimento set hora_fim = '12:30' where id = $1 returning id`, [h.id]),
        upB: await tx.consultar(`update bloqueios set motivo = 'Outro' where id = $1 returning id`, [b.id]),
        delH: await tx.consultar(`delete from horarios_atendimento where id = $1 returning id`, [h.id]),
        delB: await tx.consultar(`delete from bloqueios where id = $1 returning id`, [b.id]),
      };
    });
    expect(r.upH).toHaveLength(1);
    expect(r.upB).toHaveLength(1);
    expect(r.delH).toHaveLength(1);
    expect(r.delB).toHaveLength(1);
  });

  it('D26: a psicóloga apaga o próprio bloqueio do seed', async () => {
    const r = await banco.comoUsuario(U.psicologa, (tx) =>
      tx.consultar<{ id: string }>(`delete from bloqueios where profissional_id = $1 returning id`, [P.psicologa]),
    );
    expect(r).toHaveLength(1);
  });

  it('D26: Helena, que também atende, escreve os próprios horários como profissional (P.admin)', async () => {
    expect(await ler(U.admin, novoHorario(0), [T.a, P.admin])).toHaveLength(1);
  });

  it('D26: o admin NÃO cria horário nem bloqueio de outro profissional do próprio tenant (erro de RLS)', async () => {
    for (const alvo of [P.cabelo, P.manicure, P.psicologa]) {
      expect(await erroComo(U.admin, novoHorario(0), [T.a, alvo]), `horario ${alvo}`).toMatch(RLS_OU_PERMISSAO);
      expect(await erroComo(U.admin, novoBloqueio, [T.a, alvo]), `bloqueio ${alvo}`).toMatch(RLS_OU_PERMISSAO);
    }
  });

  it('D26/RN15: Helena e adminB não criam horário/bloqueio no tenant B nem no A (cruzado)', async () => {
    expect(await erroComo(U.admin, novoHorario(0), [T.b, P.b])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.admin, novoBloqueio, [T.b, P.b])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.adminB, novoHorario(0), [T.b, P.b])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.adminB, novoBloqueio, [T.b, P.b])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.adminB, novoHorario(0), [T.a, P.cabelo])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.adminB, novoBloqueio, [T.a, P.cabelo])).toMatch(RLS_OU_PERMISSAO);
  });

  it('D26: o admin não atualiza nem apaga horários e bloqueios de outros profissionais (0 linhas, linhas existem)', async () => {
    const antes = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ h: number; b: number }>(
        `select (select count(*)::int from horarios_atendimento where profissional_id <> $1) as h,
                (select count(*)::int from bloqueios where profissional_id <> $1) as b`,
        [P.admin],
      ),
    );
    expect(primeiro(antes).h).toBeGreaterThan(0);
    expect(primeiro(antes).b).toBeGreaterThan(0);
    await semEfeito(U.admin, `update horarios_atendimento set hora_fim = '12:30' where profissional_id <> $1 returning id`, [P.admin]);
    await semEfeito(U.admin, `delete from horarios_atendimento where profissional_id <> $1 returning id`, [P.admin]);
    await semEfeito(U.admin, `update bloqueios set motivo = 'Hack' where profissional_id <> $1 returning id`, [P.admin]);
    await semEfeito(U.admin, `delete from bloqueios where profissional_id <> $1 returning id`, [P.admin]);
  });

  it('D26: após as tentativas do admin, horários e bloqueios dos outros profissionais continuam intactos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = primeiro(
        await tx.consultar<{ h: number; b: number }>(
          `select (select count(*)::int from horarios_atendimento) as h, (select count(*)::int from bloqueios) as b`,
        ),
      );
      await tx.trocarPara(U.admin);
      // Cada tentativa pode falhar por permissão; o savepoint evita abortar a transação inteira.
      const tentar = async (sql: string): Promise<void> => {
        await tx.executar('savepoint tentativa');
        try {
          await tx.consultar(sql, [P.admin]);
          await tx.executar('release savepoint tentativa');
        } catch {
          await tx.executar('rollback to savepoint tentativa');
        }
      };
      await tentar(`update horarios_atendimento set hora_fim = '12:30' where profissional_id <> $1`);
      await tentar(`delete from horarios_atendimento where profissional_id <> $1`);
      await tentar(`update bloqueios set motivo = 'Hack' where profissional_id <> $1`);
      await tentar(`delete from bloqueios where profissional_id <> $1`);
      await tx.trocarPara('postgres');
      const depois = primeiro(
        await tx.consultar<{ h: number; b: number; hack: number }>(
          `select (select count(*)::int from horarios_atendimento) as h, (select count(*)::int from bloqueios) as b,
                  (select count(*)::int from bloqueios where motivo = 'Hack') as hack`,
        ),
      );
      return { antes, depois };
    });
    expect(r.depois.h).toBe(r.antes.h);
    expect(r.depois.b).toBe(r.antes.b);
    expect(r.depois.hack).toBe(0);
  });

  it('D26/RN12: adminB não atualiza nem apaga horários e bloqueios do tenant B nem do A (0 linhas)', async () => {
    await semEfeito(U.adminB, `update horarios_atendimento set hora_fim = '12:30' returning id`);
    await semEfeito(U.adminB, `delete from horarios_atendimento returning id`);
    await semEfeito(U.adminB, `update bloqueios set motivo = 'Hack' returning id`);
    await semEfeito(U.adminB, `delete from bloqueios returning id`);
  });

  it('RN12/D26: outro profissional não cria, altera nem apaga horários e bloqueios alheios', async () => {
    expect(await erroComo(U.manicure, novoHorario(0), [T.a, P.cabelo])).toMatch(RLS_OU_PERMISSAO);
    expect(await erroComo(U.manicure, novoBloqueio, [T.a, P.cabelo])).toMatch(RLS_OU_PERMISSAO);
    await semEfeito(U.manicure, `update horarios_atendimento set hora_fim = '12:30' where profissional_id = $1 returning id`, [P.cabelo]);
    await semEfeito(U.manicure, `delete from horarios_atendimento where profissional_id = $1 returning id`, [P.cabelo]);
    await semEfeito(U.cabelo, `delete from bloqueios where profissional_id = $1 returning id`, [P.psicologa]);
    await semEfeito(U.cabelo, `update bloqueios set motivo = 'Hack' where profissional_id = $1 returning id`, [P.psicologa]);
  });

  it('RN12: cliente e super admin não escrevem horários nem bloqueios', async () => {
    for (const quem of [U.cliente, U.superAdmin, U.clienteB]) {
      expect(await erroComo(quem, novoHorario(0), [T.a, P.cabelo]), `horario ${quem}`).toMatch(RLS_OU_PERMISSAO);
      expect(await erroComo(quem, novoBloqueio, [T.a, P.cabelo]), `bloqueio ${quem}`).toMatch(RLS_OU_PERMISSAO);
      await semEfeito(quem, `delete from horarios_atendimento where tenant_id = $1 returning id`, [T.a]);
      await semEfeito(quem, `delete from bloqueios where tenant_id = $1 returning id`, [T.a]);
    }
  });

  describe('profissional desativado não escreve horários nem bloqueios (D25/D26)', () => {
    /** Desativa o cabelo como postgres, depois executa `fn` como o próprio cabelo. */
    function comoCabeloDesativado<R>(fn: (tx: Executor) => Promise<R>): Promise<R> {
      return banco.comoSuperusuario(async (tx) => {
        await tx.consultar(`insert into horarios_atendimento (id, tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
                            values (gen_random_uuid(), $1, $2, 0, '09:00', '10:00')`, [T.a, P.cabelo]);
        await tx.consultar(`insert into bloqueios (id, tenant_id, profissional_id, inicio, fim, motivo)
                            values (gen_random_uuid(), $1, $2, now() + interval '50 days', now() + interval '50 days 1 hour', 'Antigo')`, [T.a, P.cabelo]);
        await tx.consultar('update profissionais set ativo = false where id = $1', [P.cabelo]);
        await tx.trocarPara(U.cabelo);
        return fn(tx);
      });
    }

    it('D26: não insere horário', async () => {
      expect(await comoCabeloDesativado((tx) => erroDe(tx.consultar(novoHorario(1), [T.a, P.cabelo])))).toMatch(RLS_OU_PERMISSAO);
    });

    it('D26: não insere bloqueio', async () => {
      expect(await comoCabeloDesativado((tx) => erroDe(tx.consultar(novoBloqueio, [T.a, P.cabelo])))).toMatch(RLS_OU_PERMISSAO);
    });

    it('D26: não atualiza nem apaga os horários e bloqueios que já tinha (0 linhas)', async () => {
      const r = await comoCabeloDesativado(async (tx) => ({
        upH: await tx.consultar(`update horarios_atendimento set hora_fim = '11:00' where profissional_id = $1 returning id`, [P.cabelo]),
        delH: await tx.consultar(`delete from horarios_atendimento where profissional_id = $1 returning id`, [P.cabelo]),
        upB: await tx.consultar(`update bloqueios set motivo = 'X' where profissional_id = $1 returning id`, [P.cabelo]),
        delB: await tx.consultar(`delete from bloqueios where profissional_id = $1 returning id`, [P.cabelo]),
      }));
      expect(r.upH).toHaveLength(0);
      expect(r.delH).toHaveLength(0);
      expect(r.upB).toHaveLength(0);
      expect(r.delB).toHaveLength(0);
    });
  });
});

// ---------- dispositivos_push ----------

describe('RN15: dispositivos_push (por usuário)', () => {
  it('RN15: cada usuário lê e cria só os próprios tokens', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`insert into dispositivos_push (id, usuario_id, token, plataforma) values (gen_random_uuid(), $1, 'tok-carla', 'android')`, [U.cliente]);
      await tx.consultar(`insert into dispositivos_push (id, usuario_id, token, plataforma) values (gen_random_uuid(), $1, 'tok-rafael', 'android')`, [U.cabelo]);
      const saida: Record<string, string[]> = {};
      for (const [nome, quem] of [['cliente', U.cliente], ['cabelo', U.cabelo], ['admin', U.admin], ['superAdmin', U.superAdmin]] as const) {
        await tx.trocarPara(quem);
        const l = await tx.consultar<{ token: string }>('select token from dispositivos_push');
        saida[nome] = l.map((x) => x.token);
      }
      await tx.trocarPara(null);
      saida['anon'] = (await tx.consultar<{ token: string }>('select token from dispositivos_push').catch(() => [])).map((x) => x.token);
      return saida;
    });
    expect(r['cliente']).toEqual(['tok-carla']);
    expect(r['cabelo']).toEqual(['tok-rafael']);
    expect(r['admin']).toEqual([]);
    expect(r['superAdmin']).toEqual([]);
    expect(r['anon']).toEqual([]);
  });

  it('RN15: usuário cria token próprio, mas não em nome de outro', async () => {
    const ok = await ler(U.cliente, `insert into dispositivos_push (id, usuario_id, token, plataforma) values (gen_random_uuid(), $1, 'meu', 'android') returning id`, [U.cliente]);
    expect(ok).toHaveLength(1);
    expect(
      await erroComo(U.cliente, `insert into dispositivos_push (id, usuario_id, token, plataforma) values (gen_random_uuid(), $1, 'alheio', 'android')`, [U.cabelo]),
    ).toMatch(RLS_OU_PERMISSAO);
  });

  it('RN15: admin não altera nem apaga token de outro (0 linhas)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`insert into dispositivos_push (id, usuario_id, token, plataforma) values (gen_random_uuid(), $1, 'tok-carla', 'android')`, [U.cliente]);
      await tx.trocarPara(U.admin);
      return {
        up: await tx.consultar(`update dispositivos_push set token = 'x' where usuario_id = $1 returning id`, [U.cliente]),
        del: await tx.consultar(`delete from dispositivos_push where usuario_id = $1 returning id`, [U.cliente]),
      };
    });
    expect(r.up).toHaveLength(0);
    expect(r.del).toHaveLength(0);
  });
});

// ---------- privilégios ----------

describe('RNF03: privilégios', () => {
  const tabelas = [
    'tenants',
    'usuarios',
    'membros_tenant',
    'profissionais',
    'servicos',
    'profissional_servicos',
    'horarios_atendimento',
    'bloqueios',
    'agendamentos',
    'agendamento_servicos',
    'observacoes_agendamento',
    'conclusoes',
    'dispositivos_push',
  ];

  for (const tabela of tabelas) {
    it(`RNF03: TRUNCATE em ${tabela} como authenticated dá erro de permissão`, async () => {
      expect(await erroComo(U.admin, `truncate table public.${tabela} cascade`)).toMatch(/permission denied|must be owner/i);
    });
  }

  it('RNF03: TRUNCATE como anon dá erro de permissão', async () => {
    expect(await erroComo(null, 'truncate table public.agendamentos cascade')).toMatch(/permission denied|must be owner/i);
  });

  it('RNF03: super admin também não escreve direto em tabelas operacionais', async () => {
    await semEfeito(U.superAdmin, `delete from agendamentos returning id`);
    await semEfeito(U.superAdmin, `delete from conclusoes returning agendamento_id`);
  });
});

// ---------- Storage ----------

describe('RNF03: Storage (logos e avatares, pasta <tenant_id>/)', () => {
  const inserir = `insert into storage.objects (id, bucket_id, name) values (gen_random_uuid(), $1, $2)`;

  for (const bucket of ['logos', 'avatares']) {
    it(`RNF03: admin do tenant A envia arquivo para ${bucket}/<tenant A>/`, async () => {
      expect(await ler(U.admin, `${inserir} returning id`, [bucket, `${T.a}/arquivo.png`])).toHaveLength(1);
    });

    it(`RNF03: admin do tenant A NÃO envia para a pasta do tenant B em ${bucket}`, async () => {
      expect(await erroComo(U.admin, inserir, [bucket, `${T.b}/arquivo.png`])).toMatch(RLS_OU_PERMISSAO);
    });

    it(`RNF03: adminB NÃO envia para a pasta do tenant A em ${bucket}`, async () => {
      expect(await erroComo(U.adminB, inserir, [bucket, `${T.a}/arquivo.png`])).toMatch(RLS_OU_PERMISSAO);
    });

    it(`RNF03: profissional, cliente, super admin e anônimo NÃO enviam arquivos em ${bucket}`, async () => {
      for (const quem of [U.cabelo, U.cliente, U.superAdmin, null]) {
        expect(await erroComo(quem, inserir, [bucket, `${T.a}/arquivo.png`]), String(quem)).toMatch(RLS_OU_PERMISSAO);
      }
    });

    it(`RNF03: caminho sem pasta do tenant não é aceito em ${bucket}`, async () => {
      expect(await erroComo(U.admin, inserir, [bucket, 'solto.png'])).toMatch(RLS_OU_PERMISSAO);
    });

    it(`RNF03: só o admin da pasta lista, atualiza e apaga em ${bucket}`, async () => {
      const r = await banco.comoSuperusuario(async (tx) => {
        await tx.consultar(inserir, [bucket, `${T.a}/a.png`]);
        await tx.consultar(inserir, [bucket, `${T.b}/b.png`]);
        const saida: Record<string, unknown> = {};
        await tx.trocarPara(U.admin);
        saida['adminLista'] = (await tx.consultar<{ name: string }>('select name from storage.objects where bucket_id = $1', [bucket])).map((x) => x.name);
        saida['adminUpdateOutro'] = (await tx.consultar(`update storage.objects set name = name where bucket_id = $1 and name = $2 returning id`, [bucket, `${T.b}/b.png`])).length;
        saida['adminDeleteOutro'] = (await tx.consultar(`delete from storage.objects where bucket_id = $1 and name = $2 returning id`, [bucket, `${T.b}/b.png`])).length;
        saida['adminUpdate'] = (await tx.consultar(`update storage.objects set name = name where bucket_id = $1 and name = $2 returning id`, [bucket, `${T.a}/a.png`])).length;
        await tx.trocarPara(U.cabelo);
        saida['cabeloLista'] = (await tx.consultar('select name from storage.objects where bucket_id = $1', [bucket])).length;
        saida['cabeloDelete'] = (await tx.consultar(`delete from storage.objects where bucket_id = $1 returning id`, [bucket])).length;
        await tx.trocarPara(U.adminB);
        saida['adminBDeleteA'] = (await tx.consultar(`delete from storage.objects where bucket_id = $1 and name = $2 returning id`, [bucket, `${T.a}/a.png`])).length;
        await tx.trocarPara(U.admin);
        saida['adminDelete'] = (await tx.consultar(`delete from storage.objects where bucket_id = $1 and name = $2 returning id`, [bucket, `${T.a}/a.png`])).length;
        return saida;
      });
      expect(r['adminLista']).toEqual([`${T.a}/a.png`]);
      expect(r['adminUpdateOutro']).toBe(0);
      expect(r['adminDeleteOutro']).toBe(0);
      expect(r['adminUpdate']).toBe(1);
      expect(r['cabeloLista']).toBe(0);
      expect(r['cabeloDelete']).toBe(0);
      expect(r['adminBDeleteA']).toBe(0);
      expect(r['adminDelete']).toBe(1);
    });
  }
});
