/**
 * Regressão dos achados do reviewer (Fase 2, passada 1). Cada teste reproduz o ataque descrito.
 * B1: admin sequestrando a identidade de um profissional; I1: D20; I2: Super Admin se promovendo;
 * I3: profissional desativado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, erroDe, IDS, type Banco, type Executor } from './apoio/banco.ts';

const U = IDS.usuarios;
const P = IDS.profissionais;
const A = IDS.agendamentos;
const T = IDS.tenants;

let banco: Banco;

beforeAll(async () => {
  banco = await criarBanco();
});

afterAll(async () => {
  await banco.fechar();
});

describe('B1 (RN03/RN11/D27): vínculo do profissional é imutável pela API', () => {
  it('admin não troca usuario_id de outro profissional para si', async () => {
    const msg = await banco.comoUsuario(U.admin, (tx) =>
      erroDe(tx.consultar('update profissionais set usuario_id = $1 where id = $2', [U.admin, P.psicologa])),
    );
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('admin não libera o próprio usuario_id apontando para um cliente', async () => {
    const msg = await banco.comoUsuario(U.admin, (tx) =>
      erroDe(tx.consultar('update profissionais set usuario_id = $1 where id = $2', [U.cliente, P.admin])),
    );
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('admin não move profissional para outro tenant', async () => {
    const msg = await banco.comoUsuario(U.admin, (tx) =>
      erroDe(tx.consultar('update profissionais set tenant_id = $1 where id = $2', [T.b, P.cabelo])),
    );
    expect(msg).toMatch(/CAMPO_PROTEGIDO|row-level security|violates/);
  });

  it('admin não cadastra outra pessoa como profissional pela API (só a si mesmo)', async () => {
    const msg = await banco.comoUsuario(U.adminB, (tx) =>
      erroDe(
        tx.consultar(
          `insert into profissionais (tenant_id, usuario_id, especialidade, percentual_repasse)
           values ($1, $2, 'Terapeuta', 1000)`,
          [T.b, U.clienteB],
        ),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('admin que ainda não atende se cadastra como profissional ("eu também atendo")', async () => {
    const r = await banco.comoUsuario(U.adminB, (tx) =>
      tx.consultar<{ usuario_id: string }>(
        `insert into profissionais (tenant_id, usuario_id, especialidade, percentual_repasse)
         values ($1, $2, 'Terapeuta', 0) returning usuario_id`,
        [T.b, U.adminB],
      ),
    );
    expect(r[0]?.usuario_id).toBe(U.adminB);
  });

  it('admin continua alterando especialidade, % e ativo', async () => {
    const r = await banco.comoUsuario(U.admin, (tx) =>
      tx.consultar<{ percentual_repasse: number }>(
        `update profissionais set percentual_repasse = 3500, especialidade = 'Hair stylist'
         where id = $1 returning percentual_repasse`,
        [P.cabelo],
      ),
    );
    expect(r[0]?.percentual_repasse).toBe(3500);
  });

  it('RN11/D27: admin continua sem ler a observação da psicoterapia depois das tentativas', async () => {
    const r = await banco.comoUsuario(U.admin, (tx) =>
      tx.consultar('select * from observacoes_agendamento where agendamento_id = $1', [A.psicoterapia]),
    );
    expect(r).toHaveLength(0);
  });
});

describe('I1 (D20): troca de senha obrigatória', () => {
  it('o próprio usuário não desliga a flag sem trocar a senha', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar('update usuarios set troca_senha_obrigatoria = true where id = $1', [U.cabelo]);
      await tx.trocarPara(U.cabelo);
      return erroDe(
        tx.consultar('update usuarios set troca_senha_obrigatoria = false where id = $1', [U.cabelo]),
      );
    });
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('trocar a senha no auth.users zera a flag', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar('update usuarios set troca_senha_obrigatoria = true where id = $1', [U.cabelo]);
      await tx.consultar(`update auth.users set encrypted_password = 'hash-novo' where id = $1`, [U.cabelo]);
      return tx.consultar<{ troca_senha_obrigatoria: boolean }>(
        'select troca_senha_obrigatoria from usuarios where id = $1',
        [U.cabelo],
      );
    });
    expect(r[0]?.troca_senha_obrigatoria).toBe(false);
  });

  it('o usuário continua editando nome e telefone', async () => {
    const r = await banco.comoUsuario(U.cliente, (tx) =>
      tx.consultar<{ nome: string }>(
        `update usuarios set nome = 'Carla M.', telefone = '11900000000' where id = $1 returning nome`,
        [U.cliente],
      ),
    );
    expect(r[0]?.nome).toBe('Carla M.');
  });
});

describe('I2: Super Admin não acessa dados operacionais', () => {
  it('não se torna admin de um tenant', async () => {
    const msg = await banco.comoUsuario(U.superAdmin, (tx) =>
      erroDe(
        tx.consultar(`insert into membros_tenant (tenant_id, usuario_id) values ($1, $2)`, [T.a, U.superAdmin]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('ainda nomeia outra pessoa como admin de um tenant', async () => {
    const r = await banco.comoUsuario(U.superAdmin, (tx) =>
      tx.consultar<{ usuario_id: string }>(
        `insert into membros_tenant (tenant_id, usuario_id) values ($1, $2) returning usuario_id`,
        [T.b, U.profB],
      ),
    );
    expect(r[0]?.usuario_id).toBe(U.profB);
  });

  it('não muda tema nem logo de uma clínica', async () => {
    const msg = await banco.comoUsuario(U.superAdmin, (tx) =>
      erroDe(tx.consultar(`update tenants set tema = 'onix' where id = $1`, [T.a])),
    );
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('continua ativando/desativando a clínica', async () => {
    const r = await banco.comoUsuario(U.superAdmin, (tx) =>
      tx.consultar<{ ativo: boolean }>(`update tenants set ativo = false where id = $1 returning ativo`, [T.b]),
    );
    expect(r[0]?.ativo).toBe(false);
  });
});

/** D26: desativar cancela sozinho os AGENDADO; não há mais trava PROFISSIONAL_COM_AGENDAMENTOS_PENDENTES. */
async function desativar(tx: Executor, profissionalId: string): Promise<void> {
  await tx.consultar('update profissionais set ativo = false where id = $1', [profissionalId]);
}

const MOTIVO_AUTOMATICO = 'Profissional indisponível';

interface LinhaStatus {
  id: string;
  status: string;
  motivo_cancelamento: string | null;
}

async function statusDe(tx: Executor, ids: string[]): Promise<Map<string, LinhaStatus>> {
  const linhas = await tx.consultar<LinhaStatus>(
    'select id, status, motivo_cancelamento from agendamentos where id = any($1::uuid[])',
    [ids],
  );
  return new Map(linhas.map((l) => [l.id, l]));
}

/** Executa uma escrita e devolve quantas linhas afetou; erro de permissão/RLS conta como 0 (savepoint preserva a transação). */
async function linhasAfetadas(tx: Executor, sql: string, parametros: unknown[]): Promise<number> {
  await tx.executar('savepoint tentativa');
  try {
    const r = await tx.consultar(sql, parametros);
    await tx.executar('release savepoint tentativa');
    return r.length;
  } catch (erro) {
    await tx.executar('rollback to savepoint tentativa');
    if (/row-level security|permission denied/i.test((erro as Error).message)) return 0;
    throw erro;
  }
}

describe('D26: desativar profissional cancela automaticamente os AGENDADO', () => {
  it('D26: admin desativa o cabelo pela API sem trava e o AGENDADO dele vira CANCELADO com o motivo automático', async () => {
    const r = await banco.comoUsuario(U.admin, async (tx) => {
      const up = await tx.consultar<{ ativo: boolean }>(
        'update profissionais set ativo = false where id = $1 returning ativo',
        [P.cabelo],
      );
      const visao = await tx.consultar<{ id: string; status: string; motivo_cancelamento: string | null }>(
        'select id, status, motivo_cancelamento from agendamentos_admin where profissional_id = $1',
        [P.cabelo],
      );
      return { up, visao };
    });
    expect(r.up[0]?.ativo).toBe(false);
    const simultaneo = r.visao.find((l) => l.id === A.simultaneoCabelo);
    expect(simultaneo?.status).toBe('CANCELADO');
    expect(simultaneo?.motivo_cancelamento).toBe(MOTIVO_AUTOMATICO);
  });

  it('D26: cancela TODOS os AGENDADO do profissional (inclusive vários futuros) e só os dele', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const extras: string[] = [];
      for (const dias of [30, 31, 32]) {
        const novo = await tx.consultar<{ id: string }>(
          `insert into agendamentos (tenant_id, cliente_id, profissional_id, inicio, fim, status)
           values ($1, $2, $3, now() + make_interval(days => $4::int), now() + make_interval(days => $4::int, hours => 1), 'AGENDADO')
           returning id`,
          [T.a, U.cliente, P.cabelo, dias],
        );
        extras.push(novo[0]?.id ?? '');
      }
      await tx.trocarPara(U.admin);
      await tx.consultar('update profissionais set ativo = false where id = $1', [P.cabelo]);
      await tx.trocarPara('postgres');
      return statusDe(tx, [...extras, A.simultaneoCabelo, A.simultaneoManicure, A.psicoterapia]);
    });
    expect(r.size).toBe(6);
    for (const [id, linha] of r) {
      if (id === A.simultaneoManicure || id === A.psicoterapia) {
        expect(linha.status, id).toBe('AGENDADO');
        expect(linha.motivo_cancelamento, id).toBeNull();
      } else {
        expect(linha.status, id).toBe('CANCELADO');
        expect(linha.motivo_cancelamento, id).toBe(MOTIVO_AUTOMATICO);
      }
    }
  });

  it('D26: o mesmo vale quando o UPDATE é feito como postgres (sem passar pela API)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.psicologa);
      return statusDe(tx, [A.psicoterapia]);
    });
    expect(r.get(A.psicoterapia)?.status).toBe('CANCELADO');
    expect(r.get(A.psicoterapia)?.motivo_cancelamento).toBe(MOTIVO_AUTOMATICO);
  });

  it('D26/RN05: não toca em CONCLUIDO, CANCELADO nem NAO_COMPARECEU (status, motivo e conclusão intactos)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const ids = [A.concluido, A.cancelado, A.naoCompareceu];
      const antes = await statusDe(tx, ids);
      const conclusoesAntes = await tx.consultar<{ n: number }>('select count(*)::int as n from conclusoes');
      await desativar(tx, P.cabelo);
      await desativar(tx, P.manicure);
      await desativar(tx, P.admin);
      const depois = await statusDe(tx, ids);
      const conclusoesDepois = await tx.consultar<{ n: number }>('select count(*)::int as n from conclusoes');
      return { ids, antes, depois, conclusoesAntes, conclusoesDepois };
    });
    expect(r.antes.get(A.concluido)?.status).toBe('CONCLUIDO');
    expect(r.antes.get(A.cancelado)?.status).toBe('CANCELADO');
    expect(r.antes.get(A.naoCompareceu)?.status).toBe('NAO_COMPARECEU');
    for (const id of r.ids) {
      expect(r.depois.get(id)?.status, id).toBe(r.antes.get(id)?.status);
      expect(r.depois.get(id)?.motivo_cancelamento ?? null, id).toBe(r.antes.get(id)?.motivo_cancelamento ?? null);
    }
    expect(r.conclusoesDepois[0]?.n).toBe(r.conclusoesAntes[0]?.n);
  });

  it('D26/RN05: o CANCELADO por desativação não soma no faturamento (continua só 1 conclusão no tenant)', async () => {
    const n = await banco.comoUsuario(U.admin, async (tx) => {
      await tx.consultar('update profissionais set ativo = false where id = $1', [P.cabelo]);
      const r = await tx.consultar<{ n: number }>('select count(*)::int as n from conclusoes');
      return r[0]?.n;
    });
    expect(n).toBe(1);
  });

  it('D26: reativar NÃO restaura os agendamentos cancelados', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      const rea = await tx.consultar<{ ativo: boolean }>(
        'update profissionais set ativo = true where id = $1 returning ativo',
        [P.cabelo],
      );
      await tx.trocarPara('postgres');
      return { rea, st: await statusDe(tx, [A.simultaneoCabelo]) };
    });
    expect(r.rea[0]?.ativo).toBe(true);
    expect(r.st.get(A.simultaneoCabelo)?.status).toBe('CANCELADO');
    expect(r.st.get(A.simultaneoCabelo)?.motivo_cancelamento).toBe(MOTIVO_AUTOMATICO);
  });

  it('D26: profissional, cliente e adminB não desativam outro profissional (0 linhas) e nada é cancelado', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const saida: number[] = [];
      for (const quem of [U.cabelo, U.cliente, U.adminB, U.superAdmin]) {
        await tx.trocarPara(quem);
        saida.push(await linhasAfetadas(tx, 'update profissionais set ativo = false where id = $1 returning id', [P.manicure]));
      }
      await tx.trocarPara('postgres');
      return { saida, st: await statusDe(tx, [A.simultaneoManicure]) };
    });
    expect(r.saida).toEqual([0, 0, 0, 0]);
    expect(r.st.get(A.simultaneoManicure)?.status).toBe('AGENDADO');
  });
});

describe('D26: motivo_cancelamento só junto com CANCELADO', () => {
  it('D26: gravar motivo sem cancelar (AGENDADO) dá CAMPO_PROTEGIDO, mesmo como postgres', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`update agendamentos set motivo_cancelamento = 'Teste' where id = $1`, [A.simultaneoCabelo])),
    );
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('D26: gravar motivo num CONCLUIDO dá erro (CAMPO_PROTEGIDO ou estado final)', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`update agendamentos set motivo_cancelamento = 'Teste' where id = $1`, [A.concluido])),
    );
    expect(msg).toMatch(/CAMPO_PROTEGIDO|TRANSICAO_INVALIDA|ESTADO_FINAL/);
  });

  it('D26: status CANCELADO junto com o motivo é aceito e fica gravado', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(
        `update agendamentos set status = 'CANCELADO', motivo_cancelamento = 'Motivo de teste' where id = $1`,
        [A.simultaneoCabelo],
      );
      return statusDe(tx, [A.simultaneoCabelo]);
    });
    expect(r.get(A.simultaneoCabelo)?.status).toBe('CANCELADO');
    expect(r.get(A.simultaneoCabelo)?.motivo_cancelamento).toBe('Motivo de teste');
  });

  it('D26: usuário autenticado não grava motivo direto (nem admin, nem o profissional dono): 0 linhas, motivo nulo', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const saida: number[] = [];
      for (const quem of [U.admin, U.cabelo, U.cliente]) {
        await tx.trocarPara(quem);
        saida.push(
          await linhasAfetadas(
            tx,
            `update agendamentos set status = 'CANCELADO', motivo_cancelamento = 'forjado' where id = $1 returning id`,
            [A.simultaneoCabelo],
          ),
        );
      }
      await tx.trocarPara('postgres');
      return { saida, st: await statusDe(tx, [A.simultaneoCabelo]) };
    });
    expect(r.saida).toEqual([0, 0, 0]);
    expect(r.st.get(A.simultaneoCabelo)?.status).toBe('AGENDADO');
    expect(r.st.get(A.simultaneoCabelo)?.motivo_cancelamento).toBeNull();
  });
});

describe('I3 (D17/D25/D26): profissional desativado perde o acesso operacional', () => {
  it('não lê mais agenda nem observações dos seus atendimentos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.psicologa);
      await tx.trocarPara(U.psicologa);
      const ag = await tx.consultar('select id from agendamentos');
      const obs = await tx.consultar('select agendamento_id from observacoes_agendamento');
      const cli = await tx.consultar('select id from usuarios where id = $1', [U.cliente]);
      return { ag: ag.length, obs: obs.length, cli: cli.length };
    });
    expect(r).toEqual({ ag: 0, obs: 0, cli: 0 });
  });

  it('defesa extra: concluir_atendimento recusa profissional inativo (AGENDADO inserido à força como postgres)', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.cabelo);
      const novo = await tx.consultar<{ id: string }>(
        `insert into agendamentos (tenant_id, cliente_id, profissional_id, inicio, fim)
         values ($1, $2, $3, now() - interval '1 hour', now()) returning id`,
        [T.a, U.cliente, P.cabelo],
      );
      const id = novo[0]?.id;
      await tx.consultar(
        `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
        [T.a, id, IDS.servicos.corte],
      );
      await tx.trocarPara(U.cabelo);
      return erroDe(
        tx.consultar(`select * from public.concluir_atendimento($1, -15000, 'dinheiro')`, [id]),
      );
    });
    expect(msg).toContain('AGENDAMENTO_NAO_ENCONTRADO');
  });

  it('o admin continua vendo o histórico dele', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      return tx.consultar('select id from agendamentos where profissional_id = $1', [P.cabelo]);
    });
    expect(r.length).toBeGreaterThan(0);
  });

  it('D25/D26: o admin vê no histórico o CONCLUIDO intacto e o AGENDADO cancelado com o motivo automático', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      return tx.consultar<{ id: string; status: string; motivo_cancelamento: string | null }>(
        'select id, status, motivo_cancelamento from agendamentos where profissional_id = $1',
        [P.cabelo],
      );
    });
    expect(r.find((l) => l.id === A.concluido)?.status).toBe('CONCLUIDO');
    expect(r.find((l) => l.id === A.simultaneoCabelo)?.status).toBe('CANCELADO');
    expect(r.find((l) => l.id === A.simultaneoCabelo)?.motivo_cancelamento).toBe(MOTIVO_AUTOMATICO);
  });

  it('D25: o desativado lê SÓ as próprias linhas de conclusoes (a sua; não a de outro profissional)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      // Segunda conclusão no tenant, de outro profissional ativo (psicóloga).
      const novo = await tx.consultar<{ id: string }>(
        `insert into agendamentos (tenant_id, cliente_id, profissional_id, inicio, fim)
         values ($1, $2, $3, now() - interval '3 hours', now() - interval '2 hours') returning id`,
        [T.a, U.cliente, P.psicologa],
      );
      const id = novo[0]?.id;
      await tx.consultar(
        `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
        [T.a, id, IDS.servicos.psicoterapia],
      );
      await tx.trocarPara(U.psicologa);
      await tx.consultar(`select * from public.concluir_atendimento($1, 0, 'pix'::public.forma_pagamento)`, [id]);
      await tx.trocarPara('postgres');
      await desativar(tx, P.cabelo);
      await desativar(tx, P.psicologa);
      const saida: Record<string, string[]> = {};
      for (const [nome, quem] of [['cabelo', U.cabelo], ['psicologa', U.psicologa]] as const) {
        await tx.trocarPara(quem);
        const l = await tx.consultar<{ agendamento_id: string }>('select agendamento_id from conclusoes');
        saida[nome] = l.map((x) => x.agendamento_id);
      }
      return { saida, novo: id };
    });
    expect(r.saida['cabelo']).toEqual([A.concluido]);
    expect(r.saida['psicologa']).toEqual([r.novo]);
  });

  it('D25: o desativado não lê agenda, observações nem clientes (cabelo desativado)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.cabelo);
      await tx.trocarPara(U.cabelo);
      const ag = await tx.consultar('select id from agendamentos');
      const obs = await tx.consultar('select agendamento_id from observacoes_agendamento');
      const cli = await tx.consultar('select id from usuarios where id = $1', [U.cliente]);
      const concl = await tx.consultar('select agendamento_id from conclusoes');
      return { ag: ag.length, obs: obs.length, cli: cli.length, concl: concl.length };
    });
    expect(r).toEqual({ ag: 0, obs: 0, cli: 0, concl: 1 });
  });

  it('D25: o desativado não marca falta (a RPC recusa e o agendamento não vira NAO_COMPARECEU)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.cabelo);
      const novo = await tx.consultar<{ id: string }>(
        `insert into agendamentos (tenant_id, cliente_id, profissional_id, inicio, fim)
         values ($1, $2, $3, now() - interval '1 hour', now()) returning id`,
        [T.a, U.cliente, P.cabelo],
      );
      const id = novo[0]?.id;
      await tx.consultar(
        `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
        [T.a, id, IDS.servicos.corte],
      );
      await tx.trocarPara(U.cabelo);
      await tx.executar('savepoint tentativa');
      const msg = await erroDe(tx.consultar('select * from public.marcar_nao_compareceu($1)', [id]));
      await tx.executar('rollback to savepoint tentativa');
      await tx.trocarPara('postgres');
      const st = await statusDe(tx, [id ?? '']);
      return { msg, status: st.get(id ?? '')?.status };
    });
    expect(r.msg).not.toMatch(/does not exist/i);
    expect(r.status).toBe('AGENDADO');
  });
});

describe('Gatilho de transição (ramo sem teste apontado pelo reviewer)', () => {
  it('UPDATE direto AGENDADO → CONCLUIDO sem linha em conclusoes é barrado até para postgres', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`update agendamentos set status = 'CONCLUIDO' where id = $1`, [A.simultaneoManicure])),
    );
    expect(msg).toContain('TRANSICAO_INVALIDA');
  });
});
