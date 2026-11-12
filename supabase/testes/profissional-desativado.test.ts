/**
 * Profissional desativado (D25 / D26).
 * Regras: desativado mantém só SELECT das próprias conclusões; sem acesso operacional (não é mais
 * participante ativo: cancelar/remarcar dão AGENDAMENTO_NAO_ENCONTRADO); desativar (admin pela API ou
 * postgres) cancela automaticamente TODOS os AGENDADO dele (futuros e já iniciados) com
 * motivo_cancelamento = 'Profissional indisponível'; finais ficam intactos; reativar não restaura;
 * a trava PROFISSIONAL_COM_AGENDAMENTOS_PENDENTES não existe mais.
 * Escrito a partir da especificação (CLAUDE.md seção 7.2, D25/D26), sem ler as migrations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { criarBanco, erroDe, IDS, instanteLocal, proximaData, type Banco, type Executor } from './apoio/banco.ts';

const U = IDS.usuarios;
const T = IDS.tenants;
const P = IDS.profissionais;
const S = IDS.servicos;
const AG = IDS.agendamentos;

const MOTIVO = 'Profissional indisponível';

let banco: Banco;

beforeAll(async () => {
  banco = await criarBanco();
}, 120_000);

afterAll(async () => {
  await banco.fechar();
});

// ---------- apoio (rodam como postgres) ----------

interface Conclusao {
  agendamento_id: string;
  valor_bruto: number;
  ajuste: number;
  valor_liquido: number;
  percentual_repasse: number;
  valor_clinica: number;
  valor_profissional: number;
}

/** Cria um AGENDADO já iniciado (início há 1 h, fim daqui a 1 h) com um serviço. */
async function inserirIniciado(tx: Executor, profissionalId: string, servicoId: string): Promise<string> {
  const linhas = await tx.consultar<{ id: string }>(
    `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
     values (gen_random_uuid(), $1, $2, $3, now() - interval '1 hour', now() + interval '1 hour', 'AGENDADO')
     returning id`,
    [T.a, U.cliente, profissionalId],
  );
  const id = linhas[0]!.id;
  await tx.consultar(
    `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
    [T.a, id, servicoId],
  );
  return id;
}

/** Cria um AGENDADO futuro (daqui a 40 dias) com um serviço. */
async function inserirFuturo(tx: Executor, profissionalId: string, servicoId: string): Promise<string> {
  const linhas = await tx.consultar<{ id: string }>(
    `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
     values (gen_random_uuid(), $1, $2, $3, now() + interval '40 days', now() + interval '40 days 1 hour', 'AGENDADO')
     returning id`,
    [T.a, U.cliente, profissionalId],
  );
  const id = linhas[0]!.id;
  await tx.consultar(
    `insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`,
    [T.a, id, servicoId],
  );
  return id;
}

/** Desativa pelo caminho normal (o banco cancela os AGENDADO sozinho). */
async function desativar(tx: Executor, profissionalId: string): Promise<void> {
  await tx.consultar(`update profissionais set ativo = false where id = $1`, [profissionalId]);
}

/**
 * Desativa ignorando gatilhos de usuário (session_replication_role = replica), o que desliga o
 * auto-cancelamento. Serve para montar o estado "desativado ainda com AGENDADO", que o fluxo normal
 * não produz, e provar que o acesso operacional continua barrado mesmo assim.
 */
async function desativarIgnorandoGatilhos(tx: Executor, profissionalId: string): Promise<void> {
  await tx.executar(`set local session_replication_role = replica`);
  await tx.consultar(`update profissionais set ativo = false where id = $1`, [profissionalId]);
  await tx.executar(`set local session_replication_role = origin`);
}

/** Rafael desativado pelo fluxo normal: o simultaneoCabelo vira CANCELADO; a conclusão do seed permanece. */
async function prepararRafaelDesativado(tx: Executor): Promise<void> {
  await desativar(tx, P.cabelo);
}

interface LinhaAgendamento {
  id: string;
  status: string;
  motivo_cancelamento: string | null;
}

/** Agendamentos de um profissional (id, status, motivo), ordenados por id. Chamar como postgres. */
function agendamentosDe(tx: Executor, profissionalId: string): Promise<LinhaAgendamento[]> {
  return tx.consultar<LinhaAgendamento>(
    `select id, status, motivo_cancelamento from agendamentos where profissional_id = $1 order by id`,
    [profissionalId],
  );
}

/** Agendamentos de todos os profissionais EXCETO o informado (id, status, motivo), ordenados por id. */
function agendamentosExceto(tx: Executor, profissionalId: string): Promise<LinhaAgendamento[]> {
  return tx.consultar<LinhaAgendamento>(
    `select id, status, motivo_cancelamento from agendamentos where profissional_id <> $1 order by id`,
    [profissionalId],
  );
}

async function nConclusoes(tx: Executor): Promise<number> {
  const [r] = await tx.consultar<{ n: number }>(`select count(*)::int as n from conclusoes`);
  return r!.n;
}

const CONCLUIR = `select * from public.concluir_atendimento($1, $2, $3::public.forma_pagamento)`;

// ---------- 1. leitura permitida e leitura negada ----------

describe('F2-23: leitura do profissional desativado', () => {
  it('F2-23: Rafael desativado lê a própria conclusão com os valores corretos (6000/14000, 3000 pb)', async () => {
    const linhas = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      return tx.consultar<Conclusao>(`select * from conclusoes`);
    });
    expect(linhas).toHaveLength(1);
    const c = linhas[0]!;
    expect(c.agendamento_id).toBe(AG.concluido);
    expect(Number(c.valor_bruto)).toBe(22000);
    expect(Number(c.ajuste)).toBe(-2000);
    expect(Number(c.valor_liquido)).toBe(20000);
    expect(Number(c.percentual_repasse)).toBe(3000);
    expect(Number(c.valor_clinica)).toBe(6000);
    expect(Number(c.valor_profissional)).toBe(14000);
  });

  it('D25: desativado não lê nenhum agendamento (nem os próprios, nem de outros)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      const proprios = await tx.consultar(`select id from agendamentos where profissional_id = $1`, [P.cabelo]);
      const concluidoProprio = await tx.consultar(`select id from agendamentos where id = $1`, [AG.concluido]);
      const outros = await tx.consultar(`select id from agendamentos where profissional_id <> $1`, [P.cabelo]);
      const todos = await tx.consultar(`select id from agendamentos`);
      return { proprios, concluidoProprio, outros, todos };
    });
    expect(r.proprios).toHaveLength(0);
    expect(r.concluidoProprio).toHaveLength(0);
    expect(r.outros).toHaveLength(0);
    expect(r.todos).toHaveLength(0);
  });

  it('D25: desativado não lê observacoes_agendamento (RN11 continua valendo)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const [antes] = await tx.consultar<{ n: number }>(
        `select count(*)::int as n from observacoes_agendamento where agendamento_id = $1`,
        [AG.simultaneoCabelo],
      );
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      const depois = await tx.consultar(`select * from observacoes_agendamento`);
      return { antes: antes!.n, depois };
    });
    expect(r.antes).toBeGreaterThan(0);
    expect(r.depois).toHaveLength(0);
  });

  it('D25: desativado não lê o contato do cliente (linha de usuarios da Carla)', async () => {
    const linhas = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      return tx.consultar(`select id, nome, telefone from usuarios where id = $1`, [U.cliente]);
    });
    expect(linhas).toHaveLength(0);
  });

  it('F2-23: desativado não lê conclusão de outro profissional', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      // Juliana conclui um atendimento já iniciado dela (via RPC), depois Rafael é desativado.
      const idJuliana = await inserirIniciado(tx, P.manicure, S.manicure);
      await tx.trocarPara(U.manicure);
      await tx.consultar(CONCLUIR, [idJuliana, 0, 'pix']);
      await tx.trocarPara('postgres');
      const [existe] = await tx.consultar<{ n: number }>(
        `select count(*)::int as n from conclusoes where agendamento_id = $1`,
        [idJuliana],
      );
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      const visiveis = await tx.consultar<{ agendamento_id: string }>(`select agendamento_id from conclusoes`);
      const aJuliana = await tx.consultar(`select 1 from conclusoes where agendamento_id = $1`, [idJuliana]);
      return { existe: existe!.n, visiveis, aJuliana };
    });
    expect(r.existe).toBe(1);
    expect(r.aJuliana).toHaveLength(0);
    expect(r.visiveis.map((v) => v.agendamento_id)).toEqual([AG.concluido]);
  });
});

describe('F2-23: desativado continua sem escrever em conclusoes', () => {
  it('F2-23: INSERT em conclusoes dá erro', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      return erroDe(
        tx.consultar(
          `insert into conclusoes (tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido, forma_pagamento,
                                  percentual_repasse, valor_clinica, valor_profissional)
           values ($1, $2, 10000, 0, 10000, 'pix', 3000, 3000, 7000)`,
          [T.a, AG.cancelado],
        ),
      );
    });
    expect(msg.length).toBeGreaterThan(0);
  });

  it('F2-23: UPDATE e DELETE em conclusoes afetam 0 linhas e o valor não muda', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      const atualizadas = await tx.consultar(
        `update conclusoes set valor_profissional = 99999 where agendamento_id = $1 returning agendamento_id`,
        [AG.concluido],
      );
      const apagadas = await tx.consultar(`delete from conclusoes where agendamento_id = $1 returning agendamento_id`, [
        AG.concluido,
      ]);
      await tx.trocarPara('postgres');
      const [c] = await tx.consultar<{ valor_profissional: number }>(
        `select valor_profissional from conclusoes where agendamento_id = $1`,
        [AG.concluido],
      );
      return { atualizadas, apagadas, valor: Number(c!.valor_profissional) };
    });
    expect(r.atualizadas).toHaveLength(0);
    expect(r.apagadas).toHaveLength(0);
    expect(r.valor).toBe(14000);
  });
});

// ---------- 2. sem acesso operacional ----------

describe('D25: desativado sem acesso operacional', () => {
  /** Rafael desativado (gatilhos ignorados) que ainda tem um AGENDADO iniciado e o futuro do seed. */
  async function cenario(tx: Executor): Promise<string> {
    const iniciado = await inserirIniciado(tx, P.cabelo, S.corte);
    await desativarIgnorandoGatilhos(tx, P.cabelo);
    await tx.trocarPara(U.cabelo);
    return iniciado;
  }

  it('D25: não vê a agenda mesmo com AGENDADO existente', async () => {
    const linhas = await banco.comoSuperusuario(async (tx) => {
      await cenario(tx);
      return tx.consultar(`select id from agendamentos`);
    });
    expect(linhas).toHaveLength(0);
  });

  it('D25: não conclui (concluir_atendimento) e nenhuma conclusão é criada', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await cenario(tx);
      return erroDe(tx.consultar(CONCLUIR, [id, 0, 'pix']));
    });
    expect(r.length).toBeGreaterThan(0);
  });

  it('D25: não marca falta (marcar_nao_compareceu)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await cenario(tx);
      return erroDe(tx.consultar('select public.marcar_nao_compareceu($1)', [id]));
    });
    expect(r.length).toBeGreaterThan(0);
  });

  it('D25/D26: não cancela (cancelar_agendamento) — AGENDAMENTO_NAO_ENCONTRADO, pois não é mais participante ativo; futuro e iniciado', async () => {
    const futuro = await banco.comoSuperusuario(async (tx) => {
      await cenario(tx);
      return erroDe(tx.consultar('select public.cancelar_agendamento($1)', [AG.simultaneoCabelo]));
    });
    expect(futuro).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    const iniciado = await banco.comoSuperusuario(async (tx) => {
      const id = await cenario(tx);
      return erroDe(tx.consultar('select public.cancelar_agendamento($1)', [id]));
    });
    expect(iniciado).toContain('AGENDAMENTO_NAO_ENCONTRADO');
  });

  it('D25/D26: não remarca (remarcar_agendamento) — AGENDAMENTO_NAO_ENCONTRADO; futuro e iniciado', async () => {
    const dia = proximaData([1, 2, 3, 4, 5, 6], 20);
    const futuro = await banco.comoSuperusuario(async (tx) => {
      await cenario(tx);
      return erroDe(
        tx.consultar('select public.remarcar_agendamento($1, $2)', [AG.simultaneoCabelo, instanteLocal(dia, '10:00')]),
      );
    });
    expect(futuro).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    const iniciado = await banco.comoSuperusuario(async (tx) => {
      const id = await cenario(tx);
      return erroDe(tx.consultar('select public.remarcar_agendamento($1, $2)', [id, instanteLocal(dia, '10:00')]));
    });
    expect(iniciado).toContain('AGENDAMENTO_NAO_ENCONTRADO');
  });

  it('D25/D26: nenhuma das tentativas do desativado altera os agendamentos dele (continuam AGENDADO)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await cenario(tx);
      await tx.executar('savepoint a');
      await erroDe(tx.consultar('select public.cancelar_agendamento($1)', [id]));
      await tx.executar('rollback to savepoint a');
      await tx.executar('savepoint b');
      await erroDe(tx.consultar(CONCLUIR, [id, 0, 'pix']));
      await tx.executar('rollback to savepoint b');
      await tx.trocarPara('postgres');
      return { linhas: await agendamentosDe(tx, P.cabelo), id, n: await nConclusoes(tx) };
    });
    const ativos = r.linhas.filter((l) => l.status === 'AGENDADO').map((l) => l.id);
    expect(ativos).toContain(r.id);
    expect(ativos).toContain(AG.simultaneoCabelo);
    expect(r.n).toBe(1); // só a conclusão do seed
  });
});

// ---------- 3. desativar cancela os AGENDADO automaticamente (D26) ----------

describe('D26: desativar profissional cancela todos os AGENDADO dele', () => {
  const DESATIVAR = `update profissionais set ativo = false where id = $1 returning id, ativo`;

  /** Quantos AGENDADO o profissional tem agora. */
  async function nAgendados(tx: Executor, profissionalId: string): Promise<number> {
    const [r] = await tx.consultar<{ n: number }>(
      `select count(*)::int as n from agendamentos where profissional_id = $1 and status = 'AGENDADO'`,
      [profissionalId],
    );
    return r!.n;
  }

  /** Quantos cancelados com o motivo automático o profissional tem agora. */
  async function nCanceladosPeloMotivo(tx: Executor, profissionalId: string): Promise<number> {
    const [r] = await tx.consultar<{ n: number }>(
      `select count(*)::int as n from agendamentos
        where profissional_id = $1 and status = 'CANCELADO' and motivo_cancelamento = $2`,
      [profissionalId, MOTIVO],
    );
    return r!.n;
  }

  it('D26: o admin pela API desativa Rafael e o simultaneoCabelo (1 AGENDADO) vira CANCELADO com o motivo certo', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = await nAgendados(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      const alt = await tx.consultar<{ ativo: boolean }>(DESATIVAR, [P.cabelo]);
      await tx.trocarPara('postgres');
      const ag = (await agendamentosDe(tx, P.cabelo)).find((l) => l.id === AG.simultaneoCabelo)!;
      return { antes, alt, ag, agendados: await nAgendados(tx, P.cabelo), cancelados: await nCanceladosPeloMotivo(tx, P.cabelo) };
    });
    expect(r.antes).toBe(1);
    expect(r.alt[0]!.ativo).toBe(false);
    expect(r.ag.status).toBe('CANCELADO');
    expect(r.ag.motivo_cancelamento).toBe(MOTIVO);
    expect(r.agendados).toBe(0);
    expect(r.cancelados).toBe(1);
  });

  it('D26: o postgres desativa Rafael e o resultado é o mesmo (1 cancelado com o motivo)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const alt = await tx.consultar<{ ativo: boolean }>(DESATIVAR, [P.cabelo]);
      const ag = (await agendamentosDe(tx, P.cabelo)).find((l) => l.id === AG.simultaneoCabelo)!;
      return { alt, ag, agendados: await nAgendados(tx, P.cabelo), cancelados: await nCanceladosPeloMotivo(tx, P.cabelo) };
    });
    expect(r.alt[0]!.ativo).toBe(false);
    expect(r.ag.status).toBe('CANCELADO');
    expect(r.ag.motivo_cancelamento).toBe(MOTIVO);
    expect(r.agendados).toBe(0);
    expect(r.cancelados).toBe(1);
  });

  it('D26: AGENDADO futuros E já iniciados são todos cancelados (3 no total: seed + iniciado + futuro a 40 dias) — admin pela API', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const iniciado = await inserirIniciado(tx, P.cabelo, S.corte);
      const futuro = await inserirFuturo(tx, P.cabelo, S.corte);
      const antes = await nAgendados(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      await tx.consultar(DESATIVAR, [P.cabelo]);
      await tx.trocarPara('postgres');
      const linhas = await agendamentosDe(tx, P.cabelo);
      return { antes, iniciado, futuro, linhas, agendados: await nAgendados(tx, P.cabelo), cancelados: await nCanceladosPeloMotivo(tx, P.cabelo) };
    });
    expect(r.antes).toBe(3);
    expect(r.agendados).toBe(0);
    expect(r.cancelados).toBe(3);
    for (const id of [r.iniciado, r.futuro, AG.simultaneoCabelo]) {
      const l = r.linhas.find((x) => x.id === id)!;
      expect(l.status, id).toBe('CANCELADO');
      expect(l.motivo_cancelamento, id).toBe(MOTIVO);
    }
  });

  it('D26: o mesmo vale para o postgres (3 AGENDADO, futuros e iniciado)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await inserirIniciado(tx, P.cabelo, S.corte);
      await inserirFuturo(tx, P.cabelo, S.corte);
      const antes = await nAgendados(tx, P.cabelo);
      await desativar(tx, P.cabelo);
      return { antes, agendados: await nAgendados(tx, P.cabelo), cancelados: await nCanceladosPeloMotivo(tx, P.cabelo) };
    });
    expect(r.antes).toBe(3);
    expect(r.agendados).toBe(0);
    expect(r.cancelados).toBe(3);
  });

  it('D26: CONCLUIDO, CANCELADO e NAO_COMPARECEU ficam intactos (status e motivo), e o motivo de um cancelado anterior continua NULL', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      // Juliana tem o CANCELADO do seed e o simultaneoManicure (AGENDADO); Rafael tem o CONCLUIDO; Helena, o NAO_COMPARECEU.
      const antes = {
        juliana: (await agendamentosDe(tx, P.manicure)).filter((l) => l.status !== 'AGENDADO'),
        rafael: (await agendamentosDe(tx, P.cabelo)).filter((l) => l.status !== 'AGENDADO'),
        helena: (await agendamentosDe(tx, P.admin)).filter((l) => l.status !== 'AGENDADO'),
      };
      await tx.trocarPara(U.admin);
      await tx.consultar(DESATIVAR, [P.manicure]);
      await tx.consultar(DESATIVAR, [P.cabelo]);
      await tx.consultar(DESATIVAR, [P.admin]);
      await tx.trocarPara('postgres');
      const depois = {
        juliana: (await agendamentosDe(tx, P.manicure)).filter((l) => antes.juliana.some((a) => a.id === l.id)),
        rafael: (await agendamentosDe(tx, P.cabelo)).filter((l) => antes.rafael.some((a) => a.id === l.id)),
        helena: (await agendamentosDe(tx, P.admin)).filter((l) => antes.helena.some((a) => a.id === l.id)),
      };
      const seedCancelado = (await agendamentosDe(tx, P.manicure)).find((l) => l.id === AG.cancelado)!;
      return { antes, depois, seedCancelado };
    });
    expect(r.depois).toEqual(r.antes);
    expect(r.antes.rafael.map((l) => l.id)).toContain(AG.concluido);
    expect(r.antes.helena.map((l) => l.id)).toContain(AG.naoCompareceu);
    expect(r.seedCancelado.status).toBe('CANCELADO');
    expect(r.seedCancelado.motivo_cancelamento).toBeNull();
  });

  it('D26: Helena (só NAO_COMPARECEU, nenhum AGENDADO) desativa sem cancelar nada e sem erro', async () => {
    const r = await banco.comoUsuario(U.admin, (tx) => tx.consultar<{ ativo: boolean }>(DESATIVAR, [P.admin]));
    expect(r).toHaveLength(1);
    expect(r[0]!.ativo).toBe(false);
    const motivos = await banco.comoSuperusuario(async (tx) => {
      await desativar(tx, P.admin);
      return nCanceladosPeloMotivo(tx, P.admin);
    });
    expect(motivos).toBe(0);
  });

  it('D26/RN05: a desativação não cria nem apaga conclusões', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = await nConclusoes(tx);
      await inserirIniciado(tx, P.cabelo, S.corte);
      await desativar(tx, P.cabelo);
      return { antes, depois: await nConclusoes(tx) };
    });
    expect(r.depois).toBe(r.antes);
  });

  it('D26: desativar Rafael não toca nos agendamentos de outros profissionais nem de outro tenant', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = await agendamentosExceto(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      await tx.consultar(DESATIVAR, [P.cabelo]);
      await tx.trocarPara('postgres');
      return { antes, depois: await agendamentosExceto(tx, P.cabelo) };
    });
    expect(r.depois).toEqual(r.antes);
    expect(r.antes.some((l) => l.id === AG.simultaneoManicure && l.status === 'AGENDADO')).toBe(true);
    expect(r.antes.some((l) => l.id === AG.psicoterapia && l.status === 'AGENDADO')).toBe(true);
    expect(r.antes.some((l) => l.id === AG.b)).toBe(true);
  });

  it('D26: Juliana desativada — o simultaneoManicure é cancelado com o motivo; o cancelado do seed continua com motivo NULL', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.trocarPara(U.admin);
      await tx.consultar(DESATIVAR, [P.manicure]);
      await tx.trocarPara('postgres');
      return agendamentosDe(tx, P.manicure);
    });
    const simultaneo = r.find((l) => l.id === AG.simultaneoManicure)!;
    const antigo = r.find((l) => l.id === AG.cancelado)!;
    expect(simultaneo.status).toBe('CANCELADO');
    expect(simultaneo.motivo_cancelamento).toBe(MOTIVO);
    expect(antigo.status).toBe('CANCELADO');
    expect(antigo.motivo_cancelamento).toBeNull();
  });

  it('D26: reativar (false para true) é permitido e NÃO restaura os agendamentos cancelados', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.admin);
      const alt = await tx.consultar<{ ativo: boolean }>(
        `update profissionais set ativo = true where id = $1 returning ativo`,
        [P.cabelo],
      );
      await tx.trocarPara('postgres');
      const ag = (await agendamentosDe(tx, P.cabelo)).find((l) => l.id === AG.simultaneoCabelo)!;
      return { alt, ag, agendados: await nAgendados(tx, P.cabelo) };
    });
    expect(r.alt).toHaveLength(1);
    expect(r.alt[0]!.ativo).toBe(true);
    expect(r.ag.status).toBe('CANCELADO');
    expect(r.ag.motivo_cancelamento).toBe(MOTIVO);
    expect(r.agendados).toBe(0);
  });

  it('D26/D12: o horário do cancelado fica livre — reativado o profissional, o mesmo intervalo aceita novo AGENDADO', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const alvo = (
        await tx.consultar<{ inicio: string; fim: string }>(`select inicio::text, fim::text from agendamentos where id = $1`, [AG.simultaneoCabelo])
      )[0]!;
      await desativar(tx, P.cabelo);
      await tx.consultar(`update profissionais set ativo = true where id = $1`, [P.cabelo]);
      const novo = await tx.consultar<{ id: string }>(
        `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
         values (gen_random_uuid(), $1, $2, $3, $4::timestamptz, $5::timestamptz, 'AGENDADO') returning id`,
        [T.a, U.cliente, P.cabelo, alvo.inicio, alvo.fim],
      );
      return { novo, agendados: await nAgendados(tx, P.cabelo) };
    });
    expect(r.novo).toHaveLength(1);
    expect(r.agendados).toBe(1);
  });

  it('D26: outras alterações no profissional (percentual_repasse) não cancelam nada', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = await nAgendados(tx, P.cabelo);
      await tx.trocarPara(U.admin);
      const alt = await tx.consultar<{ percentual_repasse: number; ativo: boolean }>(
        `update profissionais set percentual_repasse = 4000 where id = $1 returning percentual_repasse, ativo`,
        [P.cabelo],
      );
      await tx.trocarPara('postgres');
      return { antes, alt, depois: await nAgendados(tx, P.cabelo) };
    });
    expect(r.alt).toHaveLength(1);
    expect(Number(r.alt[0]!.percentual_repasse)).toBe(4000);
    expect(r.alt[0]!.ativo).toBe(true);
    expect(r.antes).toBe(1);
    expect(r.depois).toBe(1);
  });

  it('D26: atualizar um profissional já desativado sem mexer em ativo é permitido', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.admin);
      return tx.consultar<{ percentual_repasse: number; ativo: boolean }>(
        `update profissionais set percentual_repasse = 2500 where id = $1 returning percentual_repasse, ativo`,
        [P.cabelo],
      );
    });
    expect(Number(r[0]!.percentual_repasse)).toBe(2500);
    expect(r[0]!.ativo).toBe(false);
  });

  it('D26: a trava PROFISSIONAL_COM_AGENDAMENTOS_PENDENTES não existe mais — desativar com AGENDADO nunca dá erro', async () => {
    const viaApi = await banco.comoUsuario(U.admin, (tx) => tx.consultar<{ ativo: boolean }>(DESATIVAR, [P.manicure]));
    expect(viaApi[0]!.ativo).toBe(false);
    const viaPostgres = await banco.comoSuperusuario((tx) => tx.consultar<{ ativo: boolean }>(DESATIVAR, [P.manicure]));
    expect(viaPostgres[0]!.ativo).toBe(false);
  });
});

// ---------- 4. consequências para o desativado e defesa extra ----------

describe('D26: depois da desativação normal', () => {
  it('D25: Rafael desativado pelo fluxo normal não vê agendamento algum (nem o cancelado automaticamente)', async () => {
    const linhas = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      return tx.consultar(`select id from agendamentos`);
    });
    expect(linhas).toHaveLength(0);
  });

  it('D25/D26: Rafael desativado não cancela nem remarca o que foi cancelado automaticamente (AGENDAMENTO_NAO_ENCONTRADO)', async () => {
    const cancelar = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      return erroDe(tx.consultar('select public.cancelar_agendamento($1)', [AG.simultaneoCabelo]));
    });
    expect(cancelar).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    const remarcar = await banco.comoSuperusuario(async (tx) => {
      await prepararRafaelDesativado(tx);
      await tx.trocarPara(U.cabelo);
      return erroDe(
        tx.consultar('select public.remarcar_agendamento($1, $2)', [
          AG.simultaneoCabelo,
          instanteLocal(proximaData([1, 2, 3, 4, 5, 6], 20), '10:00'),
        ]),
      );
    });
    expect(remarcar).toContain('AGENDAMENTO_NAO_ENCONTRADO');
  });

  it('D26 (defesa extra): concluir_atendimento recusa profissional inativo, mesmo com AGENDADO iniciado que sobrou', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirIniciado(tx, P.cabelo, S.corte);
      await desativarIgnorandoGatilhos(tx, P.cabelo);
      await tx.trocarPara(U.cabelo);
      await tx.executar('savepoint a');
      const msg = await erroDe(tx.consultar(CONCLUIR, [id, 0, 'pix']));
      await tx.executar('rollback to savepoint a');
      await tx.trocarPara('postgres');
      const [ag] = await tx.consultar<{ status: string }>(`select status from agendamentos where id = $1`, [id]);
      return { msg, status: ag!.status, n: await nConclusoes(tx) };
    });
    expect(r.msg.length).toBeGreaterThan(0);
    expect(r.status).toBe('AGENDADO');
    expect(r.n).toBe(1);
  });
});
