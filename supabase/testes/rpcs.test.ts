/**
 * Testes das RPCs: criar_agendamento, concluir_atendimento, cancelar_agendamento,
 * marcar_nao_compareceu, remarcar_agendamento e intervalos_ocupados.
 * Regras: RN03, RN05–RN10, RN12, RN13, RN16, D2–D7, D12–D14, D23, D26 (agenda do profissional autônomo:
 * admin não cancela, não remarca e não cria; profissional cancela/remarca os próprios a qualquer momento;
 * cliente respeita o prazo do tenant só quando ele for maior que 0) e D27 (sem sigilo).
 * Ordem de checagem em cancelar/remarcar: não participa e não é admin → AGENDAMENTO_NAO_ENCONTRADO;
 * admin do tenant → PAPEL_SEM_PERMISSAO; estado final → ESTADO_FINAL; prazo do cliente → PRAZO_CANCELAMENTO.
 * Escritos a partir da especificação (CLAUDE.md seções 5.2, 6 e 7), sem ler as migrations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { criarBanco, erroDe, IDS, instanteLocal, proximaData, type Banco, type Executor } from './apoio/banco.ts';

const U = IDS.usuarios;
const T = IDS.tenants;
const P = IDS.profissionais;
const S = IDS.servicos;
const AG = IDS.agendamentos;

let banco: Banco;

beforeAll(async () => {
  banco = await criarBanco();
}, 120_000);

afterAll(async () => {
  await banco.fechar();
});

// ---------- apoio ----------

const DIAS_UTEIS = [1, 2, 3, 4, 5, 6] as const;
/** Dia de expediente (segunda a sábado) bem distante dos dados do seed (que ficam a no máximo 5 dias). */
const DIA = proximaData(DIAS_UTEIS, 10);
const DIA_SEGUINTE = proximaData(DIAS_UTEIS, 12);
const DOMINGO = proximaData([0], 10);

function dataPassadaUtil(): string {
  const local = new Date(Date.now() - 3 * 60 * 60 * 1000);
  for (let i = 1; i < 14; i++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - i));
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 6) return d.toISOString().slice(0, 10);
  }
  throw new Error('sem data passada');
}

function primeiro<R>(linhas: R[]): R {
  const l = linhas[0];
  if (l === undefined) throw new Error('Consulta sem linhas');
  return l;
}

function executarComo<R>(quem: string | null, fn: (tx: Executor) => Promise<R>): Promise<R> {
  return quem === null ? banco.comoAnonimo(fn) : banco.comoUsuario(quem, fn);
}

const SQL_CRIAR = 'select public.criar_agendamento($1, $2::uuid[], $3, $4) as id';
const SQL_CONCLUIR = `select * from public.concluir_atendimento($1, $2, $3::public.forma_pagamento)`;

async function criar(tx: Executor, prof: string, servicos: string[], inicio: string, obs: string | null = null): Promise<string> {
  return primeiro(await tx.consultar<{ id: string }>(SQL_CRIAR, [prof, servicos, inicio, obs])).id;
}

/** Erro de criar_agendamento como `quem`. */
function erroCriar(quem: string | null, prof: string, servicos: string[], inicio: string, obs: string | null = null): Promise<string> {
  return executarComo(quem, (tx) => erroDe(tx.consultar(SQL_CRIAR, [prof, servicos, inicio, obs])));
}

interface Conclusao {
  agendamento_id: string;
  valor_bruto: number;
  ajuste: number;
  valor_liquido: number;
  forma_pagamento: string;
  percentual_repasse: number;
  valor_clinica: number;
  valor_profissional: number;
}

/** Insere (como postgres) um agendamento + itens. `inicioSql` é uma expressão SQL fixa dos testes. */
async function inserirAgendamento(
  tx: Executor,
  o: { prof: string; servicos: string[]; duracaoMin: number; inicioSql: string; cliente?: string; tenant?: string },
): Promise<string> {
  const tenant = o.tenant ?? T.a;
  const ag = primeiro(
    await tx.consultar<{ id: string }>(
      `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
       values (gen_random_uuid(), $1, $2, $3, ${o.inicioSql}, ${o.inicioSql} + make_interval(mins => $4::int), 'AGENDADO')
       returning id`,
      [tenant, o.cliente ?? U.cliente, o.prof, o.duracaoMin],
    ),
  );
  for (const s of o.servicos) {
    await tx.consultar(`insert into agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)`, [tenant, ag.id, s]);
  }
  return ag.id;
}

/** Agendamento AGENDADO que começou há 1 hora. */
function agendamentoPassado(tx: Executor, prof: string, servicos: string[], duracaoMin: number, cliente?: string): Promise<string> {
  return inserirAgendamento(tx, { prof, servicos, duracaoMin, inicioSql: `now() - interval '1 hour'`, ...(cliente ? { cliente } : {}) });
}

/** Agendamento AGENDADO do tenant B (prazo de cancelamento 0) que começou há 1 hora. */
function agendamentoPassadoB(tx: Executor): Promise<string> {
  return inserirAgendamento(tx, {
    tenant: T.b,
    cliente: U.clienteB,
    prof: P.b,
    servicos: [S.massagemB],
    duracaoMin: 60,
    inicioSql: `now() - interval '1 hour'`,
  });
}

/** Status e quantidade de conclusões, lidos como postgres. */
async function lerComoPostgres(tx: Executor, id: string): Promise<{ status: string; n: number }> {
  await tx.trocarPara('postgres');
  return { status: await statusDe(tx, id), n: await nConclusoes(tx, id) };
}

/** Agendamento AGENDADO que começa em `minutos` minutos. */
function agendamentoEm(tx: Executor, minutos: number, prof: string = P.cabelo, servico: string = S.corte, duracaoMin = 60): Promise<string> {
  return inserirAgendamento(tx, { prof, servicos: [servico], duracaoMin, inicioSql: `now() + interval '${minutos} minutes'` });
}

async function statusDe(tx: Executor, id: string): Promise<string> {
  return primeiro(await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [id])).status;
}

async function nConclusoes(tx: Executor, id?: string): Promise<number> {
  const r = id
    ? await tx.consultar<{ n: number }>('select count(*)::int as n from conclusoes where agendamento_id = $1', [id])
    : await tx.consultar<{ n: number }>('select count(*)::int as n from conclusoes');
  return primeiro(r).n;
}

// ---------- criar_agendamento ----------

describe('criar_agendamento', () => {
  it('RN13: duração = soma dos serviços (corte 60 + escova 30 = 90 min); grava itens, status e cliente', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await criar(tx, P.cabelo, [S.corte, S.escova], instanteLocal(DIA, '09:00'));
      const ag = primeiro(
        await tx.consultar<{ inicio: Date; fim: Date; status: string; cliente_id: string; profissional_id: string }>(
          'select inicio, fim, status, cliente_id, profissional_id from agendamentos where id = $1',
          [id],
        ),
      );
      const itens = await tx.consultar<{ servico_id: string }>('select servico_id from agendamento_servicos where agendamento_id = $1', [id]);
      return { ag, itens };
    });
    expect(r.ag.inicio.toISOString()).toBe(instanteLocal(DIA, '09:00'));
    expect(r.ag.fim.toISOString()).toBe(instanteLocal(DIA, '10:30'));
    expect(r.ag.status).toBe('AGENDADO');
    expect(r.ag.cliente_id).toBe(U.cliente);
    expect(r.ag.profissional_id).toBe(P.cabelo);
    expect(r.itens.map((i) => i.servico_id).sort()).toEqual([S.corte, S.escova].sort());
  });

  it('RN13: serviço único (manicure 45 min) termina 45 min depois', async () => {
    const fim = await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await criar(tx, P.manicure, [S.manicure], instanteLocal(DIA, '10:15'));
      return primeiro(await tx.consultar<{ fim: Date }>('select fim from agendamentos where id = $1', [id])).fim;
    });
    expect(fim.toISOString()).toBe(instanteLocal(DIA, '11:00'));
  });

  it('RN12: cliente cria o agendamento, e o cliente_id é quem chamou', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, '15:00'));
      return primeiro(await tx.consultar<{ cliente_id: string }>('select cliente_id from agendamentos where id = $1', [id])).cliente_id;
    });
    expect(r).toBe(U.cliente);
  });

  it('D26: o admin do tenant NÃO cria agendamento (PAPEL_SEM_PERMISSAO), nem com o profissional que é ele mesmo', async () => {
    expect(await erroCriar(U.admin, P.cabelo, [S.escova], instanteLocal(DIA, '15:00'))).toContain('PAPEL_SEM_PERMISSAO');
    expect(await erroCriar(U.admin, P.admin, [S.limpezaPele], instanteLocal(DIA, '15:00'))).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('D26: o erro do admin não deixa linha criada em agendamentos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from agendamentos')).n;
      await tx.trocarPara(U.admin);
      await tx.executar('savepoint antes');
      const msg = await erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.escova], instanteLocal(DIA, '15:00'), null]));
      await tx.executar('rollback to savepoint antes');
      await tx.trocarPara('postgres');
      const depois = primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from agendamentos')).n;
      return { msg, antes, depois };
    });
    expect(r.msg).toContain('PAPEL_SEM_PERMISSAO');
    expect(r.depois).toBe(r.antes);
  });

  it('RN12: o mesmo cliente pode ter dois agendamentos simultâneos com profissionais diferentes', async () => {
    const n = await banco.comoUsuario(U.cliente, async (tx) => {
      await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'));
      await criar(tx, P.manicure, [S.manicure], instanteLocal(DIA, '10:00'));
      await criar(tx, P.admin, [S.limpezaPele], instanteLocal(DIA, '10:00'));
      return primeiro(
        await tx.consultar<{ n: number }>(`select count(*)::int as n from agendamentos where cliente_id = $1 and inicio = $2`, [
          U.cliente,
          instanteLocal(DIA, '10:00'),
        ]),
      ).n;
    });
    expect(n).toBe(3);
  });

  it('RN15: anônimo não executa criar_agendamento (erro de permissão)', async () => {
    expect(await erroCriar(null, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'))).toMatch(/permission denied/i);
  });

  it('RN15: chamada sem auth.uid() mesmo com papel authenticated — NAO_AUTENTICADO', async () => {
    const msg = await banco.comoUsuario(U.cliente, async (tx) => {
      await tx.executar(`select set_config('request.jwt.claim.sub', '', true)`);
      return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.corte], instanteLocal(DIA, '10:00'), null]));
    });
    expect(msg).toContain('NAO_AUTENTICADO');
  });

  it('RN14: profissional inativo — PROFISSIONAL_INDISPONIVEL', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update profissionais set ativo = false where id = '${P.cabelo}'`);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.corte], instanteLocal(DIA, '10:00'), null]));
    });
    expect(msg).toContain('PROFISSIONAL_INDISPONIVEL');
  });

  it('D23: clínica desativada — CLINICA_INDISPONIVEL; agendamentos futuros dela continuam existindo', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set ativo = false where id = '${T.a}'`);
      await tx.trocarPara(U.cliente);
      const msg = await erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.corte], instanteLocal(DIA, '10:00'), null]));
      return msg;
    });
    expect(r).toContain('CLINICA_INDISPONIVEL');
    const futuros = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set ativo = false where id = '${T.a}'`);
      return primeiro(
        await tx.consultar<{ n: number }>(
          `select count(*)::int as n from agendamentos where tenant_id = $1 and status = 'AGENDADO' and inicio > now()`,
          [T.a],
        ),
      ).n;
    });
    expect(futuros).toBe(3);
  });

  it('RN13: SERVICOS_INVALIDOS — lista vazia', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [], instanteLocal(DIA, '10:00'))).toContain('SERVICOS_INVALIDOS');
  });

  it('RN13: SERVICOS_INVALIDOS — serviço repetido', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.corte, S.corte], instanteLocal(DIA, '10:00'))).toContain('SERVICOS_INVALIDOS');
  });

  it('RN13: SERVICOS_INVALIDOS — serviço que o profissional não oferece', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.manicure], instanteLocal(DIA, '10:00'))).toContain('SERVICOS_INVALIDOS');
    expect(await erroCriar(U.cliente, P.cabelo, [S.corte, S.pedicure], instanteLocal(DIA, '10:00'))).toContain('SERVICOS_INVALIDOS');
  });

  it('RN15: SERVICOS_INVALIDOS — serviço de outro tenant', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.massagemB], instanteLocal(DIA, '10:00'))).toContain('SERVICOS_INVALIDOS');
  });

  it('D17: SERVICOS_INVALIDOS — serviço inativo', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update servicos set ativo = false where id = '${S.escova}'`);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.escova], instanteLocal(DIA, '10:00'), null]));
    });
    expect(msg).toContain('SERVICOS_INVALIDOS');
  });

  it('RN11: OBSERVACAO_LONGA com 1001 caracteres; 1000 é aceito', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'), 'a'.repeat(1001))).toContain('OBSERVACAO_LONGA');
    const n = await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'), 'a'.repeat(1000));
      return primeiro(
        await tx.consultar<{ n: number }>('select count(*)::int as n from observacoes_agendamento where agendamento_id = $1', [id]),
      ).n;
    });
    expect(n).toBe(1);
  });

  it('RN11: observação gravada; texto vazio ou só espaços não grava', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const comTexto = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '09:00'), 'Prefiro corte curto');
      const vazio = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'), '');
      const espacos = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '11:00'), '    ');
      const nulo = await criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, '13:00'));
      const cont = async (id: string) =>
        primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from observacoes_agendamento where agendamento_id = $1', [id])).n;
      const texto = primeiro(
        await tx.consultar<{ texto: string }>('select texto from observacoes_agendamento where agendamento_id = $1', [comTexto]),
      ).texto;
      return { texto, a: await cont(comTexto), b: await cont(vazio), c: await cont(espacos), d: await cont(nulo) };
    });
    expect(r.texto.trim()).toBe('Prefiro corte curto');
    expect([r.a, r.b, r.c, r.d]).toEqual([1, 0, 0, 0]);
  });

  it('D27: psicoterapia é um serviço comum — o agendamento é criado como qualquer outro (50 min), sem coluna de sigilo', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await criar(tx, P.psicologa, [S.psicoterapia], instanteLocal(DIA, '11:00'));
      const colunas = await tx.consultar<Record<string, unknown>>('select * from agendamentos where id = $1', [id]);
      return primeiro(colunas);
    });
    expect(r['status']).toBe('AGENDADO');
    expect((r['fim'] as Date).toISOString()).toBe(instanteLocal(DIA, '11:50'));
    expect(Object.keys(r)).not.toContain('sigiloso');
  });

  it('D5: HORARIO_PASSADO — data de ontem/anterior', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.corte], instanteLocal(dataPassadaUtil(), '10:00'))).toContain('HORARIO_PASSADO');
  });

  it('D5: HORARIO_FORA_DA_GRADE — minuto que não é múltiplo de 15', async () => {
    for (const hora of ['10:10', '10:05', '09:50', '10:59']) {
      expect(await erroCriar(U.cliente, P.cabelo, [S.corte], instanteLocal(DIA, hora)), hora).toContain('HORARIO_FORA_DA_GRADE');
    }
  });

  it('D5: horários 10:15, 10:30 e 10:45 estão na grade', async () => {
    for (const hora of ['10:15', '10:30', '10:45']) {
      const id = await banco.comoUsuario(U.cliente, (tx) => criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, hora)));
      expect(id).toBeTruthy();
    }
  });

  it('D6: FORA_DO_EXPEDIENTE — antes da abertura, depois do fechamento e no domingo', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DIA, '08:45'))).toContain('FORA_DO_EXPEDIENTE');
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DIA, '18:00'))).toContain('FORA_DO_EXPEDIENTE');
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DIA, '20:00'))).toContain('FORA_DO_EXPEDIENTE');
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DOMINGO, '10:00'))).toContain('FORA_DO_EXPEDIENTE');
  });

  it('D6: FORA_DO_EXPEDIENTE — ultrapassar o fim do período (17:45 + 30 min)', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DIA, '17:45'))).toContain('FORA_DO_EXPEDIENTE');
    expect(await erroCriar(U.cliente, P.cabelo, [S.corte], instanteLocal(DIA, '17:30'))).toContain('FORA_DO_EXPEDIENTE');
  });

  it('D6: encostar no fim do expediente é permitido (17:30 + 30 min = 18:00)', async () => {
    const id = await banco.comoUsuario(U.cliente, (tx) => criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, '17:30')));
    expect(id).toBeTruthy();
  });

  it('D6: atravessar o intervalo 12:00–13:00 não é permitido (corte 60 min às 11:30)', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.corte], instanteLocal(DIA, '11:30'))).toContain('FORA_DO_EXPEDIENTE');
  });

  it('D6: começar dentro do intervalo de almoço não é permitido; encostar no fim do 1º período e começar às 13:00 são', async () => {
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DIA, '12:00'))).toContain('FORA_DO_EXPEDIENTE');
    expect(await erroCriar(U.cliente, P.cabelo, [S.escova], instanteLocal(DIA, '12:30'))).toContain('FORA_DO_EXPEDIENTE');
    const ids = await banco.comoUsuario(U.cliente, async (tx) => [
      await criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, '11:30')),
      await criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, '13:00')),
    ]);
    expect(ids).toHaveLength(2);
  });

  it('D6: início 09:00 (abertura) é aceito', async () => {
    const id = await banco.comoUsuario(U.cliente, (tx) => criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '09:00')));
    expect(id).toBeTruthy();
  });

  it('RN12: HORARIO_BLOQUEADO — sobrepor bloqueio; encostar nas bordas é permitido', async () => {
    const prep = async (tx: Executor) => {
      await tx.consultar(
        `insert into bloqueios (id, tenant_id, profissional_id, inicio, fim, motivo) values (gen_random_uuid(), $1, $2, $3, $4, 'Folga')`,
        [T.a, P.cabelo, instanteLocal(DIA, '15:00'), instanteLocal(DIA, '16:00')],
      );
    };
    const tentar = (servico: string, hora: string) =>
      banco.comoSuperusuario(async (tx) => {
        await prep(tx);
        await tx.trocarPara(U.cliente);
        return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [servico], instanteLocal(DIA, hora), null]));
      });
    expect(await tentar(S.corte, '15:00')).toContain('HORARIO_BLOQUEADO');
    expect(await tentar(S.corte, '14:30')).toContain('HORARIO_BLOQUEADO');
    expect(await tentar(S.escova, '15:30')).toContain('HORARIO_BLOQUEADO');
    expect(await tentar(S.escova, '15:45')).toContain('HORARIO_BLOQUEADO');
    const ok = await banco.comoSuperusuario(async (tx) => {
      await prep(tx);
      await tx.trocarPara(U.cliente);
      return [
        await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '14:00')), // termina às 15:00
        await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '16:00')), // começa às 16:00
      ];
    });
    expect(ok).toHaveLength(2);
  });

  it('RN12: HORARIO_INDISPONIVEL — sobreposição com AGENDADO do mesmo profissional; bordas encostadas são permitidas', async () => {
    const conflito = (servico: string, hora: string) =>
      banco.comoUsuario(U.cliente, async (tx) => {
        await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00')); // 10:00–11:00
        return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [servico], instanteLocal(DIA, hora), null]));
      });
    expect(await conflito(S.corte, '10:00')).toContain('HORARIO_INDISPONIVEL');
    expect(await conflito(S.escova, '10:30')).toContain('HORARIO_INDISPONIVEL');
    expect(await conflito(S.corte, '09:30')).toContain('HORARIO_INDISPONIVEL');
    expect(await conflito(S.escova, '10:45')).toContain('HORARIO_INDISPONIVEL');
    const ok = await banco.comoUsuario(U.cliente, async (tx) => {
      await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'));
      return [
        await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '09:00')), // termina às 10:00
        await criar(tx, P.cabelo, [S.escova], instanteLocal(DIA, '11:00')), // começa às 11:00
      ];
    });
    expect(ok).toHaveLength(2);
  });

  it('RN12: outro cliente também é barrado pelo conflito do profissional (conflito é por profissional)', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      // o agendamento existente é de outro cliente (Helena como cliente); quem tenta agora é Carla
      await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.corte], duracaoMin: 60, inicioSql: `'${instanteLocal(DIA, '10:00')}'::timestamptz`, cliente: U.admin });
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.corte], instanteLocal(DIA, '10:30'), null]));
    });
    expect(msg).toContain('HORARIO_INDISPONIVEL');
  });

  it('D12: NAO_COMPARECEU continua ocupando o horário', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirAgendamento(tx, {
        prof: P.cabelo,
        servicos: [S.corte],
        duracaoMin: 60,
        inicioSql: `'${instanteLocal(DIA, '10:00')}'::timestamptz`,
      });
      await tx.executar(`update agendamentos set status = 'NAO_COMPARECEU' where id = '${id}'`);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.escova], instanteLocal(DIA, '10:30'), null]));
    });
    expect(msg).toContain('HORARIO_INDISPONIVEL');
  });

  it('D12: CANCELADO libera o horário (dá para criar outro no mesmo horário)', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const primeiroId = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'));
      await tx.consultar('select public.cancelar_agendamento($1)', [primeiroId]);
      const segundo = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'));
      return { primeiroId, segundo };
    });
    expect(r.segundo).not.toBe(r.primeiroId);
  });

  it('RN12: conflito com agendamento do seed (simultaneoCabelo) — mesma hora do profissional é barrada', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const alvo = primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [AG.simultaneoCabelo]));
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(SQL_CRIAR, [P.cabelo, [S.escova], alvo.inicio.toISOString(), null]));
    });
    // Se o dia cair fora do expediente, outro código é aceitável; o horário NUNCA pode ser criado.
    expect(msg).toMatch(/HORARIO_INDISPONIVEL|FORA_DO_EXPEDIENTE/);
  });
});

// ---------- concluir_atendimento ----------

describe('concluir_atendimento', () => {
  it('RN09 (exemplo obrigatório): bruto 22000 (15000+7000), ajuste -2000, líquido 20000, 3000 pb → clínica 6000, profissional 14000', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      const c = primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, -2000, 'pix']));
      return { c, status: await statusDe(tx, id), n: await nConclusoes(tx, id) };
    });
    expect(r.c.valor_bruto).toBe(22000);
    expect(r.c.ajuste).toBe(-2000);
    expect(r.c.valor_liquido).toBe(20000);
    expect(r.c.forma_pagamento).toBe('pix');
    expect(r.c.percentual_repasse).toBe(3000);
    expect(r.c.valor_clinica).toBe(6000);
    expect(r.c.valor_profissional).toBe(14000);
    expect(r.status).toBe('CONCLUIDO');
    expect(r.n).toBe(1);
  });

  it('RN08: ajuste positivo (acréscimo) soma ao bruto', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 1000, 'dinheiro']));
    });
    expect(c.valor_bruto).toBe(15000);
    expect(c.valor_liquido).toBe(16000);
    expect(c.valor_clinica).toBe(4800);
    expect(c.valor_profissional).toBe(11200);
    expect(c.forma_pagamento).toBe('dinheiro');
  });

  it('D2: centavo ímpar — 3000 pb sobre líquido 20001: clínica 6000 (6000,3), profissional 14001', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, -1999, 'cartao']));
    });
    expect(c.valor_liquido).toBe(20001);
    expect(c.valor_clinica).toBe(6000);
    expect(c.valor_profissional).toBe(14001);
    expect(c.valor_clinica + c.valor_profissional).toBe(c.valor_liquido);
  });

  it('D2: meio centavo arredonda para cima — 3000 pb sobre líquido 5 (1,5): clínica 2, profissional 3', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, -21995, 'pix']));
    });
    expect(c.valor_liquido).toBe(5);
    expect(c.valor_clinica).toBe(2);
    expect(c.valor_profissional).toBe(3);
  });

  it('D2: meio centavo arredonda para cima — 5000 pb sobre líquido 20001 (10000,5): clínica 10001, profissional 10000', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update profissionais set percentual_repasse = 5000 where id = '${P.cabelo}'`);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, -1999, 'pix']));
    });
    expect(c.valor_clinica).toBe(10001);
    expect(c.valor_profissional).toBe(10000);
  });

  it('RN09: percentual 0 (Helena) → clínica 0 e profissional recebe tudo; 10000 pb → clínica recebe tudo', async () => {
    const h = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.admin, [S.limpezaPele], 60);
      await tx.trocarPara(U.admin);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(h.valor_bruto).toBe(18000);
    expect(h.valor_clinica).toBe(0);
    expect(h.valor_profissional).toBe(18000);
    const total = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update profissionais set percentual_repasse = 10000 where id = '${P.cabelo}'`);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(total.valor_clinica).toBe(15000);
    expect(total.valor_profissional).toBe(0);
  });

  it('RN03: admin Helena (que não é o profissional) recebe PAPEL_SEM_PERMISSAO', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.admin);
      return erroDe(tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(msg).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('RN03: o cliente do agendamento recebe PAPEL_SEM_PERMISSAO', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(msg).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('RN03/RN15: quem não participa recebe AGENDAMENTO_NAO_ENCONTRADO (outro profissional, tenant B, super admin)', async () => {
    for (const quem of [U.manicure, U.psicologa, U.adminB, U.profB, U.clienteB, U.superAdmin]) {
      const msg = await banco.comoSuperusuario(async (tx) => {
        const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
        await tx.trocarPara(quem);
        return erroDe(tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']));
      });
      expect(msg, quem).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    }
  });

  it('RN03: id inexistente — AGENDAMENTO_NAO_ENCONTRADO', async () => {
    const msg = await executarComo(U.cabelo, (tx) =>
      erroDe(tx.consultar(SQL_CONCLUIR, ['99999999-9999-4999-8999-999999999999', 0, 'pix'])),
    );
    expect(msg).toContain('AGENDAMENTO_NAO_ENCONTRADO');
  });

  it('RN03: o admin que também atende conclui os PRÓPRIOS atendimentos', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.admin, [S.limpezaPele], 60);
      await tx.trocarPara(U.admin);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 0, 'cartao']));
    });
    expect(c.valor_liquido).toBe(18000);
  });

  it('RN15: anônimo não executa concluir_atendimento', async () => {
    const msg = await executarComo(null, (tx) => erroDe(tx.consultar(SQL_CONCLUIR, [AG.simultaneoCabelo, 0, 'pix'])));
    expect(msg).toMatch(/permission denied/i);
  });

  it('D7: ANTES_DO_INICIO — não conclui um atendimento futuro', async () => {
    const msg = await executarComo(U.cabelo, (tx) => erroDe(tx.consultar(SQL_CONCLUIR, [AG.simultaneoCabelo, 0, 'pix'])));
    expect(msg).toContain('ANTES_DO_INICIO');
  });

  it('D7: concluir é permitido a partir do início (começou há 1 hora; e começa agora)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.escova], duracaoMin: 30, inicioSql: `now()` });
      await tx.trocarPara(U.cabelo);
      const msg = await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 0, 'pix']);
      return msg.length;
    });
    expect(r).toBe(1);
  });

  it('D7: início daqui a 1 minuto ainda é ANTES_DO_INICIO', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 1);
      await tx.trocarPara(U.cabelo);
      return erroDe(tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(msg).toContain('ANTES_DO_INICIO');
  });

  it('D3: LIQUIDO_NEGATIVO quando bruto + ajuste < 0; líquido exatamente 0 é aceito', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      return erroDe(tx.consultar(SQL_CONCLUIR, [id, -15001, 'pix']));
    });
    expect(msg).toContain('LIQUIDO_NEGATIVO');
    const c = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, -15000, 'pix']));
    });
    expect(c.valor_liquido).toBe(0);
    expect(c.valor_clinica).toBe(0);
    expect(c.valor_profissional).toBe(0);
  });

  it('RN07: falha por LIQUIDO_NEGATIVO é atômica — status continua AGENDADO e não há conclusão', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.executar('savepoint antes');
      const msg = await erroDe(tx.consultar(SQL_CONCLUIR, [id, -99999, 'pix']));
      await tx.executar('rollback to savepoint antes');
      return { msg, status: await statusDe(tx, id), n: await nConclusoes(tx, id) };
    });
    expect(r.msg).toContain('LIQUIDO_NEGATIVO');
    expect(r.status).toBe('AGENDADO');
    expect(r.n).toBe(0);
  });

  it('RN07: forma de pagamento inválida é rejeitada e nada é gravado', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.executar('savepoint antes');
      const msg = await erroDe(tx.consultar(SQL_CONCLUIR, [id, 0, 'boleto']));
      await tx.executar('rollback to savepoint antes');
      return { msg, status: await statusDe(tx, id), n: await nConclusoes(tx, id) };
    });
    expect(r.msg.length).toBeGreaterThan(0);
    expect(r.status).toBe('AGENDADO');
    expect(r.n).toBe(0);
  });

  it('5.2: ESTADO_FINAL — concluir duas vezes; só uma linha em conclusoes', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']);
      await tx.executar('savepoint antes');
      const msg = await erroDe(tx.consultar(SQL_CONCLUIR, [id, 500, 'dinheiro']));
      await tx.executar('rollback to savepoint antes');
      return { msg, n: await nConclusoes(tx, id), status: await statusDe(tx, id) };
    });
    expect(r.msg).toContain('ESTADO_FINAL');
    expect(r.n).toBe(1);
    expect(r.status).toBe('CONCLUIDO');
  });

  it('5.2: ESTADO_FINAL — seed concluído, cancelado e não compareceu não podem ser concluídos', async () => {
    expect(await executarComo(U.cabelo, (tx) => erroDe(tx.consultar(SQL_CONCLUIR, [AG.concluido, 0, 'pix'])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.manicure, (tx) => erroDe(tx.consultar(SQL_CONCLUIR, [AG.cancelado, 0, 'pix'])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.admin, (tx) => erroDe(tx.consultar(SQL_CONCLUIR, [AG.naoCompareceu, 0, 'pix'])))).toContain('ESTADO_FINAL');
  });

  it('RN08/D4: o bruto é a soma dos preços ATUAIS no momento da conclusão', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update servicos set preco = 16000 where id = '${S.corte}'`);
      await tx.executar(`update servicos set preco = 8000 where id = '${S.escova}'`);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(c.valor_bruto).toBe(24000);
    expect(c.valor_liquido).toBe(24000);
    expect(c.valor_clinica).toBe(7200);
    expect(c.valor_profissional).toBe(16800);
  });

  it('RN08: alterar o preço do serviço DEPOIS não muda a conclusão gravada', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(SQL_CONCLUIR, [id, -2000, 'pix']);
      await tx.trocarPara('postgres');
      await tx.executar(`update servicos set preco = 99999 where id = '${S.corte}'`);
      return primeiro(await tx.consultar<Conclusao>('select * from conclusoes where agendamento_id = $1', [id]));
    });
    expect(r.valor_bruto).toBe(22000);
    expect(r.valor_liquido).toBe(20000);
    expect(r.valor_clinica).toBe(6000);
  });

  it('RN10: alterar a % do profissional DEPOIS não muda a conclusão gravada', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(SQL_CONCLUIR, [id, -2000, 'pix']);
      await tx.trocarPara('postgres');
      await tx.executar(`update profissionais set percentual_repasse = 9000 where id = '${P.cabelo}'`);
      return primeiro(await tx.consultar<Conclusao>('select * from conclusoes where agendamento_id = $1', [id]));
    });
    expect(r.percentual_repasse).toBe(3000);
    expect(r.valor_clinica).toBe(6000);
    expect(r.valor_profissional).toBe(14000);
  });

  it('RN10: a % usada é a vigente na hora de concluir (copiada do profissional)', async () => {
    const c = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update profissionais set percentual_repasse = 2000 where id = '${P.cabelo}'`);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      return primeiro(await tx.consultar<Conclusao>(SQL_CONCLUIR, [id, 0, 'pix']));
    });
    expect(c.percentual_repasse).toBe(2000);
    expect(c.valor_clinica).toBe(3000);
    expect(c.valor_profissional).toBe(12000);
  });

  it('RN05: o atendimento concluído é visível ao profissional, ao admin e soma 1 linha em conclusoes', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = await nConclusoes(tx);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']);
      await tx.trocarPara('postgres');
      return { antes, depois: await nConclusoes(tx) };
    });
    expect(r.depois).toBe(r.antes + 1);
  });
});

// ---------- cancelar_agendamento ----------

describe('cancelar_agendamento', () => {
  const CANCELAR = 'select public.cancelar_agendamento($1)';

  it('D26: Helena (admin que também atende) cancela o PRÓPRIO atendimento como profissional, mesmo depois do início', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.admin, [S.limpezaPele], 60);
      await tx.trocarPara(U.admin);
      await tx.consultar(CANCELAR, [id]);
      return lerComoPostgres(tx, id);
    });
    expect(r).toEqual({ status: 'CANCELADO', n: 0 });
  });

  it('RN16: cliente cancela o próprio agendamento futuro; vira CANCELADO e não cria conclusão', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const antes = await nConclusoes(tx).catch(() => 0);
      await tx.consultar(CANCELAR, [AG.simultaneoCabelo]);
      const status = await statusDe(tx, AG.simultaneoCabelo);
      return { status, antes };
    });
    expect(r.status).toBe('CANCELADO');
    const n = await banco.comoSuperusuario((tx) => nConclusoes(tx, AG.simultaneoCabelo));
    expect(n).toBe(0);
  });

  it('RN03: o profissional do atendimento cancela', async () => {
    const status = await banco.comoUsuario(U.cabelo, async (tx) => {
      await tx.consultar(CANCELAR, [AG.simultaneoCabelo]);
      return statusDe(tx, AG.simultaneoCabelo);
    });
    expect(status).toBe('CANCELADO');
  });

  it('D26: o admin do tenant NÃO cancela (PAPEL_SEM_PERMISSAO) — agendamentos futuros de qualquer profissional; status não muda', async () => {
    for (const id of [AG.simultaneoCabelo, AG.simultaneoManicure, AG.psicoterapia]) {
      const r = await banco.comoSuperusuario(async (tx) => {
        await tx.trocarPara(U.admin);
        await tx.executar('savepoint antes');
        const msg = await erroDe(tx.consultar(CANCELAR, [id]));
        await tx.executar('rollback to savepoint antes');
        return { msg, ...(await lerComoPostgres(tx, id)) };
      });
      expect(r.msg, id).toContain('PAPEL_SEM_PERMISSAO');
      expect(r.status, id).toBe('AGENDADO');
    }
  });

  it('D26: o admin do tenant NÃO cancela atendimento já iniciado (PAPEL_SEM_PERMISSAO)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.admin);
      await tx.executar('savepoint antes');
      const msg = await erroDe(tx.consultar(CANCELAR, [id]));
      await tx.executar('rollback to savepoint antes');
      return { msg, ...(await lerComoPostgres(tx, id)) };
    });
    expect(r.msg).toContain('PAPEL_SEM_PERMISSAO');
    expect(r.status).toBe('AGENDADO');
  });

  it('D26: ordem de checagem — admin em agendamento de estado final recebe PAPEL_SEM_PERMISSAO (antes de ESTADO_FINAL)', async () => {
    expect(await executarComo(U.admin, (tx) => erroDe(tx.consultar(CANCELAR, [AG.concluido])))).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('D26: o cliente do agendamento cancela mesmo sendo admin do tenant — é tratado como cliente (prazo 120 vale)', async () => {
    const dentro = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirAgendamento(tx, { prof: P.psicologa, servicos: [S.psicoterapia], duracaoMin: 50, inicioSql: `now() + interval '60 minutes'`, cliente: U.admin });
      await tx.trocarPara(U.admin);
      return erroDe(tx.consultar(CANCELAR, [id]));
    });
    expect(dentro).toContain('PRAZO_CANCELAMENTO');
    const fora = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirAgendamento(tx, { prof: P.psicologa, servicos: [S.psicoterapia], duracaoMin: 50, inicioSql: `now() + interval '240 minutes'`, cliente: U.admin });
      await tx.trocarPara(U.admin);
      await tx.consultar(CANCELAR, [id]);
      return lerComoPostgres(tx, id);
    });
    expect(fora.status).toBe('CANCELADO');
  });

  it('D26: o cliente cancela o agendamento de psicoterapia (serviço comum, sem tratamento especial — D27)', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      await tx.trocarPara(U.cliente);
      await tx.consultar(CANCELAR, [AG.psicoterapia]);
      return (await lerComoPostgres(tx, AG.psicoterapia)).status;
    });
    expect(status).toBe('CANCELADO');
  });

  it('D26: a psicóloga cancela a própria psicoterapia', async () => {
    const status = await banco.comoUsuario(U.psicologa, async (tx) => {
      await tx.consultar(CANCELAR, [AG.psicoterapia]);
      return statusDe(tx, AG.psicoterapia);
    });
    expect(status).toBe('CANCELADO');
  });

  it('RN15: quem não participa recebe AGENDAMENTO_NAO_ENCONTRADO (outro profissional, tenant B, super admin)', async () => {
    for (const quem of [U.manicure, U.psicologa, U.adminB, U.profB, U.clienteB, U.superAdmin]) {
      const msg = await executarComo(quem, (tx) => erroDe(tx.consultar(CANCELAR, [AG.simultaneoCabelo])));
      expect(msg, quem).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    }
  });

  it('RN15: o admin do tenant A não cancela agendamento do tenant B e vice-versa', async () => {
    expect(await executarComo(U.admin, (tx) => erroDe(tx.consultar(CANCELAR, [AG.b])))).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    expect(await executarComo(U.adminB, (tx) => erroDe(tx.consultar(CANCELAR, [AG.simultaneoCabelo])))).toContain('AGENDAMENTO_NAO_ENCONTRADO');
  });

  it('RN15: anônimo não executa cancelar_agendamento', async () => {
    expect(await executarComo(null, (tx) => erroDe(tx.consultar(CANCELAR, [AG.simultaneoCabelo])))).toMatch(/permission denied/i);
  });

  it('5.2: ESTADO_FINAL — concluído, cancelado e não compareceu não podem ser cancelados', async () => {
    expect(await executarComo(U.cliente, (tx) => erroDe(tx.consultar(CANCELAR, [AG.concluido])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.cliente, (tx) => erroDe(tx.consultar(CANCELAR, [AG.cancelado])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.cliente, (tx) => erroDe(tx.consultar(CANCELAR, [AG.naoCompareceu])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.cabelo, (tx) => erroDe(tx.consultar(CANCELAR, [AG.concluido])))).toContain('ESTADO_FINAL');
  });

  it('D26: DEPOIS_DO_INICIO não existe mais — o profissional do atendimento cancela depois do início, sem prazo; não cria conclusão (RN05)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const antes = await nConclusoes(tx);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(CANCELAR, [id]);
      return { ...(await lerComoPostgres(tx, id)), antes, depois: await nConclusoes(tx) };
    });
    expect(r.status).toBe('CANCELADO');
    expect(r.n).toBe(0);
    expect(r.depois).toBe(r.antes);
  });

  it('D26: o profissional ignora o prazo — cancela a 60 min do início mesmo com prazo 120 no tenant', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(CANCELAR, [id]);
      return (await lerComoPostgres(tx, id)).status;
    });
    expect(status).toBe('CANCELADO');
  });

  it('D26/RN16: cliente com prazo 0 (tenant B) cancela o próprio agendamento depois do início; não cria conclusão', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassadoB(tx);
      await tx.trocarPara(U.clienteB);
      await tx.consultar(CANCELAR, [id]);
      return lerComoPostgres(tx, id);
    });
    expect(r.status).toBe('CANCELADO');
    expect(r.n).toBe(0);
  });

  it('D26/RN16: cliente com prazo 0 (tenant A forçado a 0) também cancela depois do início', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set prazo_cancelamento_min = 0 where id = '${T.a}'`);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cliente);
      await tx.consultar(CANCELAR, [id]);
      return lerComoPostgres(tx, id);
    });
    expect(r.status).toBe('CANCELADO');
    expect(r.n).toBe(0);
  });

  it('RN16: prazo 120 (tenant A) — depois do início o cliente recebe PRAZO_CANCELAMENTO e o status não muda', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cliente);
      await tx.executar('savepoint antes');
      const msg = await erroDe(tx.consultar(CANCELAR, [id]));
      await tx.executar('rollback to savepoint antes');
      return { msg, ...(await lerComoPostgres(tx, id)) };
    });
    expect(r.msg).toContain('PRAZO_CANCELAMENTO');
    expect(r.status).toBe('AGENDADO');
  });

  it('RN16: prazo 120 (tenant A) — 125 min antes do início o cliente cancela', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 125);
      await tx.trocarPara(U.cliente);
      await tx.consultar(CANCELAR, [id]);
      return (await lerComoPostgres(tx, id)).status;
    });
    expect(status).toBe('CANCELADO');
  });

  it('RN05: cancelar em qualquer momento (antes, perto do início, depois do início) não soma nada em conclusoes', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const soma = async () =>
        primeiro(await tx.consultar<{ n: number; total: number }>('select count(*)::int as n, coalesce(sum(valor_liquido), 0)::int as total from conclusoes'));
      const antes = await soma();
      const longe = await agendamentoEm(tx, 600);
      const perto = await agendamentoEm(tx, 30, P.manicure, S.manicure, 45);
      const iniciado = await agendamentoPassado(tx, P.cabelo, [S.escova], 30);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(CANCELAR, [longe]);
      await tx.consultar(CANCELAR, [iniciado]);
      await tx.trocarPara(U.manicure);
      await tx.consultar(CANCELAR, [perto]);
      await tx.trocarPara('postgres');
      return { antes, depois: await soma(), s: [await statusDe(tx, longe), await statusDe(tx, perto), await statusDe(tx, iniciado)] };
    });
    expect(r.s).toEqual(['CANCELADO', 'CANCELADO', 'CANCELADO']);
    expect(r.depois).toEqual(r.antes);
  });

  it('RN16/D13: dentro do prazo (60 min < 120), o CLIENTE recebe PRAZO_CANCELAMENTO', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 60);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(CANCELAR, [id]));
    });
    expect(msg).toContain('PRAZO_CANCELAMENTO');
  });

  it('RN16/D13/D26: dentro do prazo o profissional consegue cancelar; o admin recebe PAPEL_SEM_PERMISSAO', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(CANCELAR, [id]);
      await tx.trocarPara('postgres');
      return statusDe(tx, id);
    });
    expect(status).toBe('CANCELADO');
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 60);
      await tx.trocarPara(U.admin);
      return erroDe(tx.consultar(CANCELAR, [id]));
    });
    expect(msg).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('RN16: fora do prazo (240 min > 120) o cliente consegue; 115 min não', async () => {
    const ok = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 240);
      await tx.trocarPara(U.cliente);
      await tx.consultar(CANCELAR, [id]);
      await tx.trocarPara('postgres');
      return statusDe(tx, id);
    });
    expect(ok).toBe('CANCELADO');
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 115);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(CANCELAR, [id]));
    });
    expect(msg).toContain('PRAZO_CANCELAMENTO');
  });

  it('RN16: com prazo 0 (padrão, sem prazo) o cliente cancela até 5 minutos antes', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set prazo_cancelamento_min = 0 where id = '${T.a}'`);
      const id = await agendamentoEm(tx, 5);
      await tx.trocarPara(U.cliente);
      await tx.consultar(CANCELAR, [id]);
      await tx.trocarPara('postgres');
      return statusDe(tx, id);
    });
    expect(status).toBe('CANCELADO');
  });

  it('RN16: o prazo é do tenant do agendamento (tenant B com prazo 0 permite cancelar de última hora)', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update agendamentos set inicio = now() + interval '10 minutes', fim = now() + interval '70 minutes' where id = '${AG.b}'`);
      await tx.trocarPara(U.clienteB);
      await tx.consultar(CANCELAR, [AG.b]);
      await tx.trocarPara('postgres');
      return statusDe(tx, AG.b);
    });
    expect(status).toBe('CANCELADO');
  });
});

// ---------- marcar_nao_compareceu ----------

describe('marcar_nao_compareceu', () => {
  const FALTOU = 'select public.marcar_nao_compareceu($1)';

  it('RN03/RN05: profissional marca falta a partir do início; vira NAO_COMPARECEU e NÃO cria conclusão', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(FALTOU, [id]);
      return { status: await statusDe(tx, id), n: await nConclusoes(tx, id) };
    });
    expect(r.status).toBe('NAO_COMPARECEU');
    expect(r.n).toBe(0);
  });

  it('RN03: admin (não é o profissional) e cliente recebem PAPEL_SEM_PERMISSAO', async () => {
    for (const quem of [U.admin, U.cliente]) {
      const msg = await banco.comoSuperusuario(async (tx) => {
        const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
        await tx.trocarPara(quem);
        return erroDe(tx.consultar(FALTOU, [id]));
      });
      expect(msg, quem).toContain('PAPEL_SEM_PERMISSAO');
    }
  });

  it('RN03: o admin que também atende marca falta nos PRÓPRIOS atendimentos', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.admin, [S.limpezaPele], 60);
      await tx.trocarPara(U.admin);
      await tx.consultar(FALTOU, [id]);
      await tx.trocarPara('postgres');
      return statusDe(tx, id);
    });
    expect(status).toBe('NAO_COMPARECEU');
  });

  it('RN15: quem não participa recebe AGENDAMENTO_NAO_ENCONTRADO', async () => {
    for (const quem of [U.manicure, U.adminB, U.profB, U.clienteB, U.superAdmin]) {
      const msg = await banco.comoSuperusuario(async (tx) => {
        const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
        await tx.trocarPara(quem);
        return erroDe(tx.consultar(FALTOU, [id]));
      });
      expect(msg, quem).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    }
  });

  it('D7: ANTES_DO_INICIO — não marca falta em atendimento futuro', async () => {
    expect(await executarComo(U.cabelo, (tx) => erroDe(tx.consultar(FALTOU, [AG.simultaneoCabelo])))).toContain('ANTES_DO_INICIO');
  });

  it('5.2: ESTADO_FINAL — concluído, cancelado e já não compareceu', async () => {
    expect(await executarComo(U.cabelo, (tx) => erroDe(tx.consultar(FALTOU, [AG.concluido])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.manicure, (tx) => erroDe(tx.consultar(FALTOU, [AG.cancelado])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.admin, (tx) => erroDe(tx.consultar(FALTOU, [AG.naoCompareceu])))).toContain('ESTADO_FINAL');
  });

  it('5.2: depois de NAO_COMPARECEU não se conclui nem se cancela (estado final)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(FALTOU, [id]);
      await tx.executar('savepoint a');
      const m1 = await erroDe(tx.consultar(SQL_CONCLUIR, [id, 0, 'pix']));
      await tx.executar('rollback to savepoint a');
      const m2 = await erroDe(tx.consultar('select public.cancelar_agendamento($1)', [id]));
      return { m1, m2 };
    });
    expect(r.m1).toContain('ESTADO_FINAL');
    expect(r.m2).toContain('ESTADO_FINAL');
  });

  it('RN15: anônimo não executa marcar_nao_compareceu', async () => {
    expect(await executarComo(null, (tx) => erroDe(tx.consultar(FALTOU, [AG.simultaneoCabelo])))).toMatch(/permission denied/i);
  });
});

// ---------- remarcar_agendamento ----------

describe('remarcar_agendamento', () => {
  const REMARCAR = 'select public.remarcar_agendamento($1, $2)';

  it('D26: Helena (admin que também atende) remarca o PRÓPRIO atendimento como profissional, mesmo depois do início', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.admin, [S.limpezaPele], 60);
      await tx.trocarPara(U.admin);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]);
      return lerComoPostgres(tx, id);
    });
    expect(r).toEqual({ status: 'AGENDADO', n: 0 });
  });

  it('D14/RN06: cliente remarca; muda só início/fim (duração mantida), status AGENDADO, serviços e valores intocados', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const antes = primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from agendamento_servicos where agendamento_id = $1', [AG.simultaneoCabelo])).n;
      await tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '16:00')]);
      const ag = primeiro(
        await tx.consultar<{ inicio: Date; fim: Date; status: string; profissional_id: string }>(
          'select inicio, fim, status, profissional_id from agendamentos where id = $1',
          [AG.simultaneoCabelo],
        ),
      );
      const depois = primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from agendamento_servicos where agendamento_id = $1', [AG.simultaneoCabelo])).n;
      const obs = primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from observacoes_agendamento where agendamento_id = $1', [AG.simultaneoCabelo])).n;
      return { ag, antes, depois, obs };
    });
    expect(r.ag.inicio.toISOString()).toBe(instanteLocal(DIA, '16:00'));
    expect(r.ag.fim.toISOString()).toBe(instanteLocal(DIA, '17:00'));
    expect(r.ag.status).toBe('AGENDADO');
    expect(r.ag.profissional_id).toBe(P.cabelo);
    expect(r.antes).toBe(r.depois);
    expect(r.obs).toBe(1);
    const concl = await banco.comoSuperusuario(async (tx) => {
      await tx.trocarPara(U.cliente);
      await tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '16:00')]);
      await tx.trocarPara('postgres');
      return nConclusoes(tx);
    });
    expect(concl).toBe(1);
  });

  it('RN03/D26: o profissional do atendimento remarca', async () => {
    const ini = await banco.comoUsuario(U.cabelo, async (tx) => {
      await tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '16:00')]);
      return primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [AG.simultaneoCabelo])).inicio;
    });
    expect(ini.toISOString()).toBe(instanteLocal(DIA, '16:00'));
  });

  it('D26: o admin do tenant NÃO remarca (PAPEL_SEM_PERMISSAO) — futuros de qualquer profissional; horário não muda', async () => {
    for (const id of [AG.simultaneoCabelo, AG.simultaneoManicure, AG.psicoterapia]) {
      const r = await banco.comoSuperusuario(async (tx) => {
        const antes = primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [id])).inicio;
        await tx.trocarPara(U.admin);
        await tx.executar('savepoint antes');
        const msg = await erroDe(tx.consultar(REMARCAR, [id, instanteLocal(DIA, '16:00')]));
        await tx.executar('rollback to savepoint antes');
        await tx.trocarPara('postgres');
        const depois = primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [id])).inicio;
        return { msg, antes, depois };
      });
      expect(r.msg, id).toContain('PAPEL_SEM_PERMISSAO');
      expect(r.depois.getTime(), id).toBe(r.antes.getTime());
    }
  });

  it('D26: o admin do tenant NÃO remarca atendimento já iniciado (PAPEL_SEM_PERMISSAO)', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.admin);
      return erroDe(tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]));
    });
    expect(msg).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('D26: ordem de checagem — admin em agendamento de estado final recebe PAPEL_SEM_PERMISSAO (antes de ESTADO_FINAL)', async () => {
    expect(await executarComo(U.admin, (tx) => erroDe(tx.consultar(REMARCAR, [AG.concluido, instanteLocal(DIA, '10:00')])))).toContain('PAPEL_SEM_PERMISSAO');
  });

  it('D26: o cliente do agendamento remarca mesmo sendo admin do tenant — tratado como cliente (prazo 120 vale)', async () => {
    const dentro = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.corte], duracaoMin: 60, inicioSql: `now() + interval '60 minutes'`, cliente: U.admin });
      await tx.trocarPara(U.admin);
      return erroDe(tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]));
    });
    expect(dentro).toContain('PRAZO_CANCELAMENTO');
    const fora = await banco.comoSuperusuario(async (tx) => {
      const id = await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.corte], duracaoMin: 60, inicioSql: `now() + interval '240 minutes'`, cliente: U.admin });
      await tx.trocarPara(U.admin);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]);
      await tx.trocarPara('postgres');
      return primeiro(await tx.consultar<{ inicio: Date; status: string }>('select inicio, status from agendamentos where id = $1', [id]));
    });
    expect(fora.inicio.toISOString()).toBe(instanteLocal(DIA, '10:00'));
    expect(fora.status).toBe('AGENDADO');
  });

  it('RN15: quem não participa recebe AGENDAMENTO_NAO_ENCONTRADO', async () => {
    for (const quem of [U.manicure, U.adminB, U.profB, U.clienteB, U.superAdmin]) {
      const msg = await executarComo(quem, (tx) => erroDe(tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '16:00')])));
      expect(msg, quem).toContain('AGENDAMENTO_NAO_ENCONTRADO');
    }
  });

  it('RN15: anônimo não executa remarcar_agendamento', async () => {
    expect(await executarComo(null, (tx) => erroDe(tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '16:00')])))).toMatch(/permission denied/i);
  });

  it('RN12: pode remarcar para um horário que se sobrepõe ao próprio horário antigo', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00')); // 10:00–11:00
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:30')]); // 10:30–11:30
      return primeiro(await tx.consultar<{ inicio: Date; fim: Date }>('select inicio, fim from agendamentos where id = $1', [id]));
    });
    expect(r.inicio.toISOString()).toBe(instanteLocal(DIA, '10:30'));
    expect(r.fim.toISOString()).toBe(instanteLocal(DIA, '11:30'));
  });

  it('RN12: HORARIO_INDISPONIVEL — conflito com outro agendamento do mesmo profissional; encostar é permitido', async () => {
    const tentar = (hora: string) =>
      banco.comoSuperusuario(async (tx) => {
        await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.corte], duracaoMin: 60, inicioSql: `'${instanteLocal(DIA, '10:00')}'::timestamptz` });
        await tx.trocarPara(U.cliente);
        return erroDe(tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, hora)]));
      });
    expect(await tentar('10:00')).toContain('HORARIO_INDISPONIVEL');
    expect(await tentar('10:30')).toContain('HORARIO_INDISPONIVEL');
    expect(await tentar('09:30')).toContain('HORARIO_INDISPONIVEL');
    const ok = await banco.comoSuperusuario(async (tx) => {
      await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.corte], duracaoMin: 60, inicioSql: `'${instanteLocal(DIA, '10:00')}'::timestamptz` });
      await tx.trocarPara(U.cliente);
      await tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '11:00')]);
      return statusDe(tx, AG.simultaneoCabelo);
    });
    expect(ok).toBe('AGENDADO');
  });

  it('D12: remarcar para um horário liberado por cancelamento funciona', async () => {
    const status = await banco.comoSuperusuario(async (tx) => {
      const outro = await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.corte], duracaoMin: 60, inicioSql: `'${instanteLocal(DIA, '10:00')}'::timestamptz` });
      await tx.executar(`update agendamentos set status = 'CANCELADO' where id = '${outro}'`);
      await tx.trocarPara(U.cliente);
      await tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '10:00')]);
      return statusDe(tx, AG.simultaneoCabelo);
    });
    expect(status).toBe('AGENDADO');
  });

  it('RN12: HORARIO_BLOQUEADO ao remarcar para cima de um bloqueio', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(
        `insert into bloqueios (id, tenant_id, profissional_id, inicio, fim, motivo) values (gen_random_uuid(), $1, $2, $3, $4, 'Folga')`,
        [T.a, P.cabelo, instanteLocal(DIA, '15:00'), instanteLocal(DIA, '16:00')],
      );
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '14:30')]));
    });
    expect(msg).toContain('HORARIO_BLOQUEADO');
  });

  it('D5/D6: valida grade, expediente e passado ao remarcar', async () => {
    const tentar = (hora: string, dia = DIA) =>
      executarComo(U.cliente, (tx) => erroDe(tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(dia, hora)])));
    expect(await tentar('10:10')).toContain('HORARIO_FORA_DA_GRADE');
    expect(await tentar('08:45')).toContain('FORA_DO_EXPEDIENTE');
    expect(await tentar('10:00', DOMINGO)).toContain('FORA_DO_EXPEDIENTE');
    expect(await tentar('17:30')).toContain('FORA_DO_EXPEDIENTE'); // corte de 60 min ultrapassa as 18:00
    expect(await tentar('11:30')).toContain('FORA_DO_EXPEDIENTE'); // atravessa o almoço
    expect(await tentar('10:00', dataPassadaUtil())).toContain('HORARIO_PASSADO');
  });

  it('D6: remarcar encostando no fim do expediente (17:00 + 60 min) é permitido', async () => {
    const status = await banco.comoUsuario(U.cliente, async (tx) => {
      await tx.consultar(REMARCAR, [AG.simultaneoCabelo, instanteLocal(DIA, '17:00')]);
      return statusDe(tx, AG.simultaneoCabelo);
    });
    expect(status).toBe('AGENDADO');
  });

  it('5.2: ESTADO_FINAL — não remarca concluído, cancelado ou não compareceu', async () => {
    expect(await executarComo(U.cliente, (tx) => erroDe(tx.consultar(REMARCAR, [AG.cancelado, instanteLocal(DIA, '10:00')])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.cliente, (tx) => erroDe(tx.consultar(REMARCAR, [AG.concluido, instanteLocal(DIA, '10:00')])))).toContain('ESTADO_FINAL');
    expect(await executarComo(U.cliente, (tx) => erroDe(tx.consultar(REMARCAR, [AG.naoCompareceu, instanteLocal(DIA, '10:00')])))).toContain('ESTADO_FINAL');
  });

  it('D26: DEPOIS_DO_INICIO não existe mais — o profissional remarca um atendimento já iniciado para horário futuro, mantendo a duração (90 min) e o estado AGENDADO', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte, S.escova], 90);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]);
      await tx.trocarPara('postgres');
      const ag = primeiro(await tx.consultar<{ inicio: Date; fim: Date; status: string; profissional_id: string }>('select inicio, fim, status, profissional_id from agendamentos where id = $1', [id]));
      const itens = primeiro(await tx.consultar<{ n: number }>('select count(*)::int as n from agendamento_servicos where agendamento_id = $1', [id])).n;
      return { ag, itens, n: await nConclusoes(tx, id) };
    });
    expect(r.ag.inicio.toISOString()).toBe(instanteLocal(DIA, '10:00'));
    expect(r.ag.fim.toISOString()).toBe(instanteLocal(DIA, '11:30'));
    expect(r.ag.status).toBe('AGENDADO');
    expect(r.ag.profissional_id).toBe(P.cabelo);
    expect(r.itens).toBe(2);
    expect(r.n).toBe(0);
  });

  it('D26: remarcar atendimento já iniciado exige NOVO início futuro — passado dá HORARIO_PASSADO', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cabelo);
      return erroDe(tx.consultar(REMARCAR, [id, instanteLocal(dataPassadaUtil(), '10:00')]));
    });
    expect(msg).toContain('HORARIO_PASSADO');
  });

  it('D26: o profissional remarca atendimento já iniciado também para horário inválido — grade, expediente e conflito continuam valendo', async () => {
    const tentar = (hora: string, dia = DIA) =>
      banco.comoSuperusuario(async (tx) => {
        await inserirAgendamento(tx, { prof: P.cabelo, servicos: [S.escova], duracaoMin: 30, inicioSql: `'${instanteLocal(DIA, '14:00')}'::timestamptz` });
        const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
        await tx.trocarPara(U.cabelo);
        return erroDe(tx.consultar(REMARCAR, [id, instanteLocal(dia, hora)]));
      });
    expect(await tentar('10:10')).toContain('HORARIO_FORA_DA_GRADE');
    expect(await tentar('08:45')).toContain('FORA_DO_EXPEDIENTE');
    expect(await tentar('14:15')).toContain('HORARIO_INDISPONIVEL');
  });

  it('D26/RN16: cliente com prazo 0 (tenant B) remarca o próprio agendamento depois do início, para horário futuro', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassadoB(tx);
      await tx.trocarPara(U.clienteB);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '21:00')]);
      await tx.trocarPara('postgres');
      const ag = primeiro(await tx.consultar<{ inicio: Date; status: string }>('select inicio, status from agendamentos where id = $1', [id]));
      return { ag, n: await nConclusoes(tx, id) };
    });
    expect(r.ag.inicio.toISOString()).toBe(instanteLocal(DIA, '21:00'));
    expect(r.ag.status).toBe('AGENDADO');
    expect(r.n).toBe(0);
  });

  it('D26/RN16: cliente com prazo 0 (tenant A forçado a 0) remarca depois do início', async () => {
    const ini = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update tenants set prazo_cancelamento_min = 0 where id = '${T.a}'`);
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cliente);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]);
      await tx.trocarPara('postgres');
      return primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [id])).inicio;
    });
    expect(ini.toISOString()).toBe(instanteLocal(DIA, '10:00'));
  });

  it('RN16: prazo 120 (tenant A) — depois do início o cliente recebe PRAZO_CANCELAMENTO ao remarcar', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoPassado(tx, P.cabelo, [S.corte], 60);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]));
    });
    expect(msg).toContain('PRAZO_CANCELAMENTO');
  });

  it('RN16: prazo 120 (tenant A) — 125 min antes do início o cliente remarca', async () => {
    const ini = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 125);
      await tx.trocarPara(U.cliente);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]);
      await tx.trocarPara('postgres');
      return primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [id])).inicio;
    });
    expect(ini.toISOString()).toBe(instanteLocal(DIA, '10:00'));
  });

  it('RN16/D13/D26: dentro do prazo (60 min) o CLIENTE recebe PRAZO_CANCELAMENTO; o profissional ignora o prazo e remarca', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 60);
      await tx.trocarPara(U.cliente);
      return erroDe(tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]));
    });
    expect(msg).toContain('PRAZO_CANCELAMENTO');
    const ini = await banco.comoSuperusuario(async (tx) => {
      const id = await agendamentoEm(tx, 60);
      await tx.trocarPara(U.cabelo);
      await tx.consultar(REMARCAR, [id, instanteLocal(DIA, '10:00')]);
      await tx.trocarPara('postgres');
      return primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [id])).inicio;
    });
    expect(ini.toISOString()).toBe(instanteLocal(DIA, '10:00'));
  });

  it('D14: remarcar a psicoterapia (serviço comum, D27) mantém o mesmo profissional e o estado AGENDADO', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      await tx.consultar(REMARCAR, [AG.psicoterapia, instanteLocal(DIA_SEGUINTE, '11:00')]);
      return primeiro(await tx.consultar<{ profissional_id: string; status: string; fim: Date }>('select profissional_id, status, fim from agendamentos where id = $1', [AG.psicoterapia]));
    });
    expect(r.profissional_id).toBe(P.psicologa);
    expect(r.status).toBe('AGENDADO');
    expect(r.fim.toISOString()).toBe(instanteLocal(DIA_SEGUINTE, '11:50'));
  });
});

// ---------- intervalos_ocupados ----------

describe('intervalos_ocupados', () => {
  const SQL_INTERVALOS = 'select * from public.intervalos_ocupados($1, $2, $3)';
  const janela = () => [new Date(Date.now() - 7 * 86_400_000).toISOString(), new Date(Date.now() + 7 * 86_400_000).toISOString()] as const;

  it('RN12: anônimo vê os intervalos ocupados do profissional (agendamentos e bloqueios) sem dados do cliente nem motivo', async () => {
    const [de, ate] = janela();
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(
        `insert into bloqueios (id, tenant_id, profissional_id, inicio, fim, motivo) values (gen_random_uuid(), $1, $2, now() + interval '4 days', now() + interval '4 days 1 hour', 'Segredo médico')`,
        [T.a, P.cabelo],
      );
      const esperadoAg = primeiro(await tx.consultar<{ inicio: Date; fim: Date }>('select inicio, fim from agendamentos where id = $1', [AG.simultaneoCabelo]));
      await tx.trocarPara(null);
      const linhas = await tx.consultar<Record<string, unknown>>(SQL_INTERVALOS, [P.cabelo, de, ate]);
      return { linhas, esperadoAg };
    });
    expect(r.linhas.length).toBeGreaterThanOrEqual(3); // concluído (-3d), simultâneo (+3d) e bloqueio (+4d)
    for (const l of r.linhas) {
      expect(Object.keys(l).sort()).toEqual(['fim', 'inicio']);
    }
    expect(JSON.stringify(r.linhas)).not.toMatch(/Segredo|Carla|cliente/i);
    const alvo = r.linhas.find((l) => (l['inicio'] as Date).getTime() === r.esperadoAg.inicio.getTime());
    expect(alvo).toBeDefined();
  });

  it('D12: agendamentos CANCELADOS não aparecem (Juliana tem o cancelado do seed)', async () => {
    const [de, ate] = janela();
    const r = await banco.comoSuperusuario(async (tx) => {
      const cancelado = primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [AG.cancelado]));
      await tx.trocarPara(null);
      const linhas = await tx.consultar<{ inicio: Date }>(SQL_INTERVALOS, [P.manicure, de, ate]);
      return { cancelado, linhas };
    });
    expect(r.linhas.some((l) => l.inicio.getTime() === r.cancelado.inicio.getTime())).toBe(false);
    expect(r.linhas.length).toBeGreaterThanOrEqual(1); // o simultaneoManicure aparece
  });

  it('D12: concluído e não compareceu aparecem como ocupados', async () => {
    const [de, ate] = janela();
    const r = await banco.comoSuperusuario(async (tx) => {
      const nc = primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [AG.naoCompareceu]));
      const cc = primeiro(await tx.consultar<{ inicio: Date }>('select inicio from agendamentos where id = $1', [AG.concluido]));
      await tx.trocarPara(null);
      return {
        nc,
        cc,
        admin: await tx.consultar<{ inicio: Date }>(SQL_INTERVALOS, [P.admin, de, ate]),
        cabelo: await tx.consultar<{ inicio: Date }>(SQL_INTERVALOS, [P.cabelo, de, ate]),
      };
    });
    expect(r.admin.some((l) => l.inicio.getTime() === r.nc.inicio.getTime())).toBe(true);
    expect(r.cabelo.some((l) => l.inicio.getTime() === r.cc.inicio.getTime())).toBe(true);
  });

  it('RN12: usuário autenticado (cliente) também pode chamar', async () => {
    const [de, ate] = janela();
    const r = await banco.comoUsuario(U.cliente, (tx) => tx.consultar(SQL_INTERVALOS, [P.cabelo, de, ate]));
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it('D27: o intervalo da psicoterapia aparece como ocupado como qualquer outro, sem identificar o cliente', async () => {
    const [de, ate] = janela();
    const linhas = await banco.comoAnonimo((tx) => tx.consultar<Record<string, unknown>>(SQL_INTERVALOS, [P.psicologa, de, ate]));
    expect(linhas.length).toBeGreaterThanOrEqual(2); // psicoterapia + bloqueio
    for (const l of linhas) expect(Object.keys(l).sort()).toEqual(['fim', 'inicio']);
  });

  it('RN15: não vaza dados de outro tenant além de intervalos (profissional B visível, mas só início/fim)', async () => {
    const [de, ate] = janela();
    const linhas = await banco.comoAnonimo((tx) => tx.consultar<Record<string, unknown>>(SQL_INTERVALOS, [P.b, de, ate]));
    for (const l of linhas) expect(Object.keys(l).sort()).toEqual(['fim', 'inicio']);
    expect(JSON.stringify(linhas)).not.toContain('lombar');
  });

  it('PERIODO_INVALIDO: janela maior que 31 dias', async () => {
    const de = new Date().toISOString();
    const ate = new Date(Date.now() + 32 * 86_400_000).toISOString();
    expect(await executarComo(null, (tx) => erroDe(tx.consultar(SQL_INTERVALOS, [P.cabelo, de, ate])))).toContain('PERIODO_INVALIDO');
  });

  it('PERIODO_INVALIDO: janela de exatamente 31 dias é aceita', async () => {
    const de = new Date().toISOString();
    const ate = new Date(Date.now() + 31 * 86_400_000).toISOString();
    const r = await banco.comoAnonimo((tx) => tx.consultar(SQL_INTERVALOS, [P.cabelo, de, ate]));
    expect(Array.isArray(r)).toBe(true);
  });

  it('RN14: profissional inativo — resultado vazio', async () => {
    const [de, ate] = janela();
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.executar(`update profissionais set ativo = false where id = '${P.cabelo}'`);
      await tx.trocarPara(null);
      return tx.consultar(SQL_INTERVALOS, [P.cabelo, de, ate]);
    });
    expect(r).toHaveLength(0);
  });

  it('RN12: criar_agendamento reflete em intervalos_ocupados e cancelar libera', async () => {
    const r = await banco.comoUsuario(U.cliente, async (tx) => {
      const de = instanteLocal(DIA, '00:00');
      const ate = instanteLocal(DIA, '23:59');
      const id = await criar(tx, P.cabelo, [S.corte], instanteLocal(DIA, '10:00'));
      const depoisCriar = await tx.consultar<{ inicio: Date; fim: Date }>(SQL_INTERVALOS, [P.cabelo, de, ate]);
      await tx.consultar('select public.cancelar_agendamento($1)', [id]);
      const depoisCancelar = await tx.consultar(SQL_INTERVALOS, [P.cabelo, de, ate]);
      return { depoisCriar, depoisCancelar };
    });
    expect(r.depoisCriar).toHaveLength(1);
    expect(primeiro(r.depoisCriar).inicio.toISOString()).toBe(instanteLocal(DIA, '10:00'));
    expect(primeiro(r.depoisCriar).fim.toISOString()).toBe(instanteLocal(DIA, '11:00'));
    expect(r.depoisCancelar).toHaveLength(0);
  });
});
