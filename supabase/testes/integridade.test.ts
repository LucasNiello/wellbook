/**
 * Integridade no banco: constraint anti-conflito por profissional (RN12), máquina de estados (5.2),
 * checks de dinheiro e percentual (D1, D3, RN07–RN09), gatilho de usuarios e colunas protegidas.
 * Todos os cenários rodam como postgres: provam que a regra vale mesmo fora da API/RLS.
 * Escritos a partir da especificação, sem ler as migrations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { criarBanco, erroDe, IDS, type Banco, type Executor } from './apoio/banco.ts';

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

function primeiro<R>(linhas: R[]): R {
  const l = linhas[0];
  if (l === undefined) throw new Error('Consulta sem linhas');
  return l;
}

const EXCLUSAO = /conflicting key|exclusion|23P01|HORARIO_INDISPONIVEL/i;
const VIOLACAO = /violates|check|constraint|23514|23505|23503|invalid|out of range/i;

/** Insere um agendamento arbitrário (como postgres) em [inicio, fim). */
function inserir(
  tx: Executor,
  o: { prof: string; cliente?: string; inicio: string; fim: string; status?: string },
): Promise<{ id: string }[]> {
  return tx.consultar<{ id: string }>(
    `insert into agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
     values (gen_random_uuid(), $1, $2, $3, ${o.inicio}, ${o.fim}, $4) returning id`,
    [T.a, o.cliente ?? U.cliente, o.prof, o.status ?? 'AGENDADO'],
  );
}

const futuro = (horasInicio: number, horasFim: number) => ({
  inicio: `now() + interval '${horasInicio} hours'`,
  fim: `now() + interval '${horasFim} hours'`,
});

// ---------- anti-conflito ----------

describe('RN12: constraint anti-conflito por profissional', () => {
  it('RN12: dois AGENDADO sobrepostos do mesmo profissional são barrados pelo banco', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await inserir(tx, { prof: P.cabelo, ...futuro(200, 201) });
      return erroDe(inserir(tx, { prof: P.cabelo, ...futuro(200, 201) }));
    });
    expect(msg).toMatch(EXCLUSAO);
  });

  it('RN12: sobreposição parcial (começa antes e termina dentro) também é barrada', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await inserir(tx, { prof: P.cabelo, ...futuro(200, 202) });
      return erroDe(inserir(tx, { prof: P.cabelo, inicio: `now() + interval '199 hours'`, fim: `now() + interval '201 hours'` }));
    });
    expect(msg).toMatch(EXCLUSAO);
  });

  it('RN12: intervalo contido em outro é barrado', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await inserir(tx, { prof: P.cabelo, ...futuro(200, 204) });
      return erroDe(inserir(tx, { prof: P.cabelo, ...futuro(201, 202) }));
    });
    expect(msg).toMatch(EXCLUSAO);
  });

  it('RN12: horários que apenas se encostam (fim = início do outro) são permitidos', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await inserir(tx, { prof: P.cabelo, ...futuro(200, 201) });
      const antes = await inserir(tx, { prof: P.cabelo, ...futuro(199, 200) });
      const depois = await inserir(tx, { prof: P.cabelo, ...futuro(201, 202) });
      return [antes, depois];
    });
    expect(r.flat()).toHaveLength(2);
  });

  it('RN12: profissionais diferentes no mesmo horário não conflitam (nem para clientes diferentes)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const a = await inserir(tx, { prof: P.cabelo, ...futuro(200, 201) });
      const b = await inserir(tx, { prof: P.manicure, ...futuro(200, 201) });
      const c = await inserir(tx, { prof: P.admin, cliente: U.clienteB, ...futuro(200, 201) });
      return [a, b, c];
    });
    expect(r.flat()).toHaveLength(3);
  });

  it('Seção 7: o seed tem 2 agendamentos simultâneos do mesmo cliente com profissionais diferentes', async () => {
    const r = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ n: number }>(
        `select count(*)::int as n
           from agendamentos a
           join agendamentos b on b.cliente_id = a.cliente_id and b.id <> a.id
            and a.inicio < b.fim and b.inicio < a.fim and a.profissional_id <> b.profissional_id
          where a.id = $1 and b.id = $2 and a.status = 'AGENDADO' and b.status = 'AGENDADO'`,
        [AG.simultaneoCabelo, AG.simultaneoManicure],
      ),
    );
    expect(primeiro(r).n).toBe(1);
  });

  it('RN12: o mesmo cliente pode ganhar um 3º agendamento simultâneo com outro profissional', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const alvo = primeiro(await tx.consultar<{ inicio: string; fim: string }>('select inicio::text, fim::text from agendamentos where id = $1', [AG.simultaneoCabelo]));
      return inserir(tx, { prof: P.admin, inicio: `'${alvo.inicio}'::timestamptz`, fim: `'${alvo.fim}'::timestamptz` });
    });
    expect(r).toHaveLength(1);
  });

  it('D12: CANCELADO não conflita — pode-se agendar exatamente no mesmo horário do cancelado do seed', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      const alvo = primeiro(await tx.consultar<{ inicio: string; fim: string }>('select inicio::text, fim::text from agendamentos where id = $1', [AG.cancelado]));
      return inserir(tx, { prof: P.manicure, inicio: `'${alvo.inicio}'::timestamptz`, fim: `'${alvo.fim}'::timestamptz` });
    });
    expect(r).toHaveLength(1);
  });

  it('D12: CONCLUIDO e NAO_COMPARECEU do seed continuam ocupando o horário no banco', async () => {
    for (const [id, prof] of [[AG.concluido, P.cabelo], [AG.naoCompareceu, P.admin]] as const) {
      const msg = await banco.comoSuperusuario(async (tx) => {
        const alvo = primeiro(await tx.consultar<{ inicio: string; fim: string }>('select inicio::text, fim::text from agendamentos where id = $1', [id]));
        return erroDe(inserir(tx, { prof, inicio: `'${alvo.inicio}'::timestamptz`, fim: `'${alvo.fim}'::timestamptz` }));
      });
      expect(msg, id).toMatch(EXCLUSAO);
    }
  });

  it('D12: a constraint barra também a volta de CANCELADO para AGENDADO em horário já ocupado (se a transição existir, o banco nega)', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      const alvo = primeiro(await tx.consultar<{ inicio: string; fim: string }>('select inicio::text, fim::text from agendamentos where id = $1', [AG.cancelado]));
      await inserir(tx, { prof: P.manicure, inicio: `'${alvo.inicio}'::timestamptz`, fim: `'${alvo.fim}'::timestamptz` });
      return erroDe(tx.consultar(`update agendamentos set status = 'AGENDADO' where id = $1`, [AG.cancelado]));
    });
    expect(msg.length).toBeGreaterThan(0);
  });

  it('RN12: fim deve ser posterior ao início', async () => {
    const msg = await banco.comoSuperusuario((tx) => erroDe(inserir(tx, { prof: P.cabelo, ...futuro(201, 200) })));
    expect(msg).toMatch(VIOLACAO);
  });

  it('RN15 (exploratório): agendamento do tenant A com profissional do tenant B é rejeitado', async () => {
    const msg = await banco.comoSuperusuario((tx) => erroDe(inserir(tx, { prof: P.b, ...futuro(300, 301) })));
    expect(msg).toMatch(VIOLACAO);
  });
});

// ---------- máquina de estados ----------

describe('5.2: máquina de estados no banco (vale até para postgres)', () => {
  const finais = [
    ['CONCLUIDO', AG.concluido],
    ['CANCELADO', AG.cancelado],
    ['NAO_COMPARECEU', AG.naoCompareceu],
  ] as const;
  const todos = ['AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'] as const;

  for (const [estado, id] of finais) {
    for (const destino of todos) {
      if (destino === estado) continue;
      it(`5.2: ${estado} → ${destino} é barrado mesmo com UPDATE direto como postgres`, async () => {
        const r = await banco.comoSuperusuario(async (tx) => {
          await tx.executar('savepoint s');
          const msg = await erroDe(tx.consultar(`update agendamentos set status = '${destino}' where id = $1`, [id]));
          await tx.executar('rollback to savepoint s');
          const atual = primeiro(await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [id])).status;
          return { msg, atual };
        });
        expect(r.msg.length).toBeGreaterThan(0);
        expect(r.atual).toBe(estado);
      });
    }
  }

  it('5.2: AGENDADO → CANCELADO é permitido', async () => {
    const s = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`update agendamentos set status = 'CANCELADO' where id = $1`, [AG.simultaneoCabelo]);
      return primeiro(await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [AG.simultaneoCabelo])).status;
    });
    expect(s).toBe('CANCELADO');
  });

  it('5.2: AGENDADO → NAO_COMPARECEU é permitido', async () => {
    const s = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`update agendamentos set status = 'NAO_COMPARECEU' where id = $1`, [AG.simultaneoManicure]);
      return primeiro(await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [AG.simultaneoManicure])).status;
    });
    expect(s).toBe('NAO_COMPARECEU');
  });

  it('5.2: remarcar (AGENDADO → AGENDADO com nova data) é permitido', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(
        `update agendamentos set inicio = inicio + interval '1 day', fim = fim + interval '1 day' where id = $1`,
        [AG.simultaneoCabelo],
      );
      return primeiro(await tx.consultar<{ status: string }>('select status from agendamentos where id = $1', [AG.simultaneoCabelo])).status;
    });
    expect(r).toBe('AGENDADO');
  });

  it('5.2: depois de CANCELADO, nenhum UPDATE de status reabre o agendamento (cancela e tenta voltar na mesma transação)', async () => {
    const msg = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`update agendamentos set status = 'CANCELADO' where id = $1`, [AG.simultaneoCabelo]);
      return erroDe(tx.consultar(`update agendamentos set status = 'AGENDADO' where id = $1`, [AG.simultaneoCabelo]));
    });
    expect(msg.length).toBeGreaterThan(0);
  });

});

// ---------- dinheiro e percentual ----------

describe('Dinheiro em centavos e limites (D1, D3, RN07–RN09)', () => {
  it('RNF02: colunas de dinheiro são inteiras (sem ponto flutuante nem numeric)', async () => {
    const r = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ table_name: string; column_name: string; data_type: string }>(
        `select table_name, column_name, data_type from information_schema.columns
          where table_schema = 'public'
            and ((table_name = 'servicos' and column_name = 'preco')
              or (table_name = 'conclusoes' and column_name in ('valor_bruto','ajuste','valor_liquido','valor_clinica','valor_profissional','percentual_repasse'))
              or (table_name = 'profissionais' and column_name = 'percentual_repasse'))`,
      ),
    );
    expect(r).toHaveLength(8);
    for (const c of r) expect(c.data_type, `${c.table_name}.${c.column_name}`).toMatch(/^(integer|bigint|smallint)$/);
  });

  it('RN10/D1: percentual_repasse fora de 0..10000 é rejeitado; 0 e 10000 são aceitos', async () => {
    for (const valor of [-1, 10001, 100000]) {
      const msg = await banco.comoSuperusuario((tx) =>
        erroDe(tx.consultar('update profissionais set percentual_repasse = $1 where id = $2', [valor, P.cabelo])),
      );
      expect(msg, String(valor)).toMatch(VIOLACAO);
    }
    for (const valor of [0, 10000]) {
      const r = await banco.comoSuperusuario((tx) =>
        tx.consultar<{ percentual_repasse: number }>(
          'update profissionais set percentual_repasse = $1 where id = $2 returning percentual_repasse',
          [valor, P.cabelo],
        ),
      );
      expect(primeiro(r).percentual_repasse).toBe(valor);
    }
  });

  it('RN08: preço de serviço negativo é rejeitado; 0 é aceito', async () => {
    const msg = await banco.comoSuperusuario((tx) => erroDe(tx.consultar('update servicos set preco = -1 where id = $1', [S.corte])));
    expect(msg).toMatch(VIOLACAO);
    const r = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ preco: number }>('update servicos set preco = 0 where id = $1 returning preco', [S.corte]),
    );
    expect(primeiro(r).preco).toBe(0);
  });

  it('RN13: duracao_min fora de 5..720 é rejeitada; 5 e 720 são aceitas', async () => {
    for (const valor of [0, 4, 721]) {
      const msg = await banco.comoSuperusuario((tx) => erroDe(tx.consultar('update servicos set duracao_min = $1 where id = $2', [valor, S.corte])));
      expect(msg, String(valor)).toMatch(VIOLACAO);
    }
    for (const valor of [5, 720]) {
      const r = await banco.comoSuperusuario((tx) =>
        tx.consultar<{ duracao_min: number }>('update servicos set duracao_min = $1 where id = $2 returning duracao_min', [valor, S.corte]),
      );
      expect(primeiro(r).duracao_min).toBe(valor);
    }
  });

  it('RN12: dia_semana fora de 0..6 é rejeitado; 0 é aceito', async () => {
    const sql = `insert into horarios_atendimento (id, tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
                 values (gen_random_uuid(), $1, $2, $3, '09:00', '12:00') returning id`;
    for (const dia of [7, -1]) {
      const msg = await banco.comoSuperusuario((tx) => erroDe(tx.consultar(sql, [T.a, P.cabelo, dia])));
      expect(msg, String(dia)).toMatch(VIOLACAO);
    }
    const r = await banco.comoSuperusuario((tx) => tx.consultar(sql, [T.a, P.cabelo, 0]));
    expect(r).toHaveLength(1);
  });

  it('RN07: a conclusão do seed fecha as contas (bruto + ajuste = líquido; clínica + profissional = líquido)', async () => {
    const c = primeiro(
      await banco.comoSuperusuario((tx) =>
        tx.consultar<{
          valor_bruto: number;
          ajuste: number;
          valor_liquido: number;
          valor_clinica: number;
          valor_profissional: number;
          percentual_repasse: number;
          forma_pagamento: string;
        }>('select * from conclusoes where agendamento_id = $1', [AG.concluido]),
      ),
    );
    expect(c.valor_bruto).toBe(22000);
    expect(c.ajuste).toBe(-2000);
    expect(c.valor_liquido).toBe(20000);
    expect(c.percentual_repasse).toBe(3000);
    expect(c.valor_clinica).toBe(6000);
    expect(c.valor_profissional).toBe(14000);
    expect(c.forma_pagamento).toBe('pix');
  });

  it('RN07: líquido inconsistente (bruto + ajuste ≠ líquido) é rejeitado pelo banco', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar('update conclusoes set valor_liquido = 19999 where agendamento_id = $1', [AG.concluido])),
    );
    expect(msg).toMatch(VIOLACAO);
  });

  it('RN09: divisão que não fecha com o líquido (clínica + profissional ≠ líquido) é rejeitada', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar('update conclusoes set valor_clinica = 6001 where agendamento_id = $1', [AG.concluido])),
    );
    expect(msg).toMatch(VIOLACAO);
  });

  it('D3: líquido negativo é rejeitado', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(
        tx.consultar(
          `update conclusoes set ajuste = -22001, valor_liquido = -1, valor_clinica = 0, valor_profissional = -1 where agendamento_id = $1`,
          [AG.concluido],
        ),
      ),
    );
    expect(msg).toMatch(VIOLACAO);
  });

  it('RN10: percentual gravado na conclusão fora de 0..10000 é rejeitado', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar('update conclusoes set percentual_repasse = 10001 where agendamento_id = $1', [AG.concluido])),
    );
    expect(msg).toMatch(VIOLACAO);
  });

  it('5.2: 1:1 — segunda conclusão para o mesmo agendamento é rejeitada', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(
        tx.consultar(
          `insert into conclusoes (tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido, forma_pagamento, percentual_repasse, valor_clinica, valor_profissional)
           values ($1, $2, 22000, -2000, 20000, 'pix', 3000, 6000, 14000)`,
          [T.a, AG.concluido],
        ),
      ),
    );
    expect(msg.length).toBeGreaterThan(0);
  });

  it('RN07: forma_pagamento só aceita pix, dinheiro e cartao', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`update conclusoes set forma_pagamento = 'boleto' where agendamento_id = $1`, [AG.concluido])),
    );
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------- D27: sem sigilo ----------

describe('D27: a decisão de sigilo (D19) foi removida do modelo', () => {
  it('D27: não existe servicos.sigiloso nem agendamentos.sigiloso', async () => {
    const r = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and column_name = 'sigiloso'`,
      ),
    );
    expect(r).toEqual([]);
  });

  it('D27: a psicoterapia do seed é um serviço comum (50 min, R$ 200,00) e o agendamento AGENDADO dela existe', async () => {
    const r = await banco.comoSuperusuario(async (tx) => ({
      servico: primeiro(await tx.consultar<{ duracao_min: number; preco: number }>('select duracao_min, preco from servicos where id = $1', [S.psicoterapia])),
      ag: primeiro(await tx.consultar<{ status: string; profissional_id: string }>('select status, profissional_id from agendamentos where id = $1', [AG.psicoterapia])),
    }));
    expect(r.servico).toEqual({ duracao_min: 50, preco: 20000 });
    expect(r.ag).toEqual({ status: 'AGENDADO', profissional_id: P.psicologa });
  });
});

// ---------- vínculos e unicidade ----------

describe('RN14/D10: unicidade e papéis', () => {
  it('RN14: profissionais.usuario_id é único (um usuário não vira dois profissionais)', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(
        tx.consultar(
          `insert into profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse)
           values (gen_random_uuid(), $1, $2, 'duplicada', 1000)`,
          [T.a, U.cabelo],
        ),
      ),
    );
    expect(msg).toMatch(/unique|duplicate|23505/i);
  });

  it('D10: membros_tenant guarda só o papel admin', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`insert into membros_tenant (tenant_id, usuario_id, papel) values ($1, $2, 'profissional')`, [T.a, U.cliente])),
    );
    expect(msg.length).toBeGreaterThan(0);
  });

  it('Seção 7: o admin do tenant A também é profissional (membro admin + linha em profissionais)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => ({
      membro: await tx.consultar('select 1 from membros_tenant where tenant_id = $1 and usuario_id = $2 and papel = \'admin\'', [T.a, U.admin]),
      prof: await tx.consultar('select 1 from profissionais where id = $1 and usuario_id = $2 and ativo', [P.admin, U.admin]),
    }));
    expect(r.membro).toHaveLength(1);
    expect(r.prof).toHaveLength(1);
  });

  it('RN15: slug do tenant é único', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`insert into tenants (id, nome, slug, tema) select gen_random_uuid(), 'Duplicada', slug, tema from tenants where id = $1`, [T.a])),
    );
    expect(msg).toMatch(/unique|duplicate|23505/i);
  });

  it('D17: FK impede apagar profissional/serviço com agendamento no histórico, mesmo como postgres', async () => {
    const m1 = await banco.comoSuperusuario((tx) => erroDe(tx.consultar('delete from servicos where id = $1', [S.corte])));
    expect(m1).toMatch(/foreign key|violates|23503/i);
    const m2 = await banco.comoSuperusuario((tx) => erroDe(tx.consultar('delete from profissionais where id = $1', [P.cabelo])));
    expect(m2).toMatch(/foreign key|violates|23503/i);
  });
});

// ---------- gatilho auth.users -> usuarios ----------

describe('RF01/RF05: gatilho que cria usuarios a partir de auth.users', () => {
  it('RF05: novo usuário em auth.users ganha linha em public.usuarios com o mesmo id e e-mail', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(
        `insert into auth.users (id, email, raw_user_meta_data) values ('cccccccc-0000-4000-8000-000000000001', 'novo@example.com', '{"nome":"Fulano Novo","consentimento_lgpd":true}'::jsonb)`,
      );
      return tx.consultar<{ id: string; email: string; super_admin: boolean; provedor_login: string; nome: string | null }>(
        `select id, email, super_admin, provedor_login, nome from usuarios where id = 'cccccccc-0000-4000-8000-000000000001'`,
      );
    });
    expect(r).toHaveLength(1);
    expect(primeiro(r).email).toBe('novo@example.com');
    expect(primeiro(r).super_admin).toBe(false);
    expect(primeiro(r).provedor_login).toBe('email');
    expect(primeiro(r).nome).toBeTruthy();
  });

  it('RN15: metadados do cadastro não concedem super_admin (escalada de privilégio)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ('cccccccc-0000-4000-8000-000000000002', 'esperto@example.com', '{"nome":"Esperto","super_admin":true,"consentimento_lgpd":true}'::jsonb)`,
      );
      return tx.consultar<{ super_admin: boolean }>(`select super_admin from usuarios where id = 'cccccccc-0000-4000-8000-000000000002'`);
    });
    expect(r).toHaveLength(1);
    expect(primeiro(r).super_admin).toBe(false);
  });

  it('RN15: o usuário recém-criado não é membro de nenhum tenant nem profissional', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`insert into auth.users (id, email, raw_user_meta_data) values ('cccccccc-0000-4000-8000-000000000003', 'sem@example.com', '{"consentimento_lgpd":true}'::jsonb)`);
      return {
        m: await tx.consultar(`select 1 from membros_tenant where usuario_id = 'cccccccc-0000-4000-8000-000000000003'`),
        p: await tx.consultar(`select 1 from profissionais where usuario_id = 'cccccccc-0000-4000-8000-000000000003'`),
      };
    });
    expect(r.m).toHaveLength(0);
    expect(r.p).toHaveLength(0);
  });

  it('RN15: a seed tem uma linha em usuarios para cada auth.users', async () => {
    const r = await banco.comoSuperusuario((tx) =>
      tx.consultar<{ n: number }>(`select count(*)::int as n from auth.users a where not exists (select 1 from usuarios u where u.id = a.id)`),
    );
    expect(primeiro(r).n).toBe(0);
  });
});

// ---------- colunas protegidas ----------

describe('RN15: colunas protegidas (CAMPO_PROTEGIDO) para o papel authenticated', () => {
  async function comoAuth<R>(quem: string, fn: (tx: Executor) => Promise<R>): Promise<R> {
    return banco.comoUsuario(quem, fn);
  }

  it('RN15: usuarios.email e usuarios.super_admin só mudam fora da API', async () => {
    expect(await comoAuth(U.cliente, (tx) => erroDe(tx.consultar(`update usuarios set email = 'x@example.com' where id = $1`, [U.cliente])))).toContain('CAMPO_PROTEGIDO');
    expect(await comoAuth(U.cliente, (tx) => erroDe(tx.consultar(`update usuarios set super_admin = true where id = $1`, [U.cliente])))).toContain('CAMPO_PROTEGIDO');
    expect(await comoAuth(U.superAdmin, (tx) => erroDe(tx.consultar(`update usuarios set super_admin = false where id = $1`, [U.superAdmin])))).toContain('CAMPO_PROTEGIDO');
  });

  it('RN15: tenants.slug e tenants.ativo só o Super Admin altera', async () => {
    expect(await comoAuth(U.admin, (tx) => erroDe(tx.consultar(`update tenants set slug = 'outro' where id = $1`, [T.a])))).toContain('CAMPO_PROTEGIDO');
    expect(await comoAuth(U.admin, (tx) => erroDe(tx.consultar(`update tenants set ativo = false where id = $1`, [T.a])))).toContain('CAMPO_PROTEGIDO');
    const r = await comoAuth(U.superAdmin, (tx) =>
      tx.consultar<{ slug: string }>(`update tenants set slug = 'serena-nova', ativo = true where id = $1 returning slug`, [T.a]),
    );
    expect(primeiro(r).slug).toBe('serena-nova');
  });

  it('D26: agendamentos.motivo_cancelamento só é gravado junto com status CANCELADO — motivo sem cancelar é CAMPO_PROTEGIDO (até como postgres)', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(tx.consultar(`update agendamentos set motivo_cancelamento = 'Qualquer motivo' where id = $1`, [AG.simultaneoCabelo])),
    );
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('D26: motivo_cancelamento junto com outro status final (NAO_COMPARECEU) também é CAMPO_PROTEGIDO', async () => {
    const msg = await banco.comoSuperusuario((tx) =>
      erroDe(
        tx.consultar(`update agendamentos set status = 'NAO_COMPARECEU', motivo_cancelamento = 'Qualquer motivo' where id = $1`, [AG.simultaneoCabelo]),
      ),
    );
    expect(msg).toContain('CAMPO_PROTEGIDO');
  });

  it('D26: o erro de motivo sem cancelar não altera a linha (continua AGENDADO, motivo nulo)', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.executar('savepoint s');
      await erroDe(tx.consultar(`update agendamentos set motivo_cancelamento = 'x' where id = $1`, [AG.simultaneoCabelo]));
      await tx.executar('rollback to savepoint s');
      return primeiro(await tx.consultar<{ status: string; motivo_cancelamento: string | null }>('select status, motivo_cancelamento from agendamentos where id = $1', [AG.simultaneoCabelo]));
    });
    expect(r).toEqual({ status: 'AGENDADO', motivo_cancelamento: null });
  });

  it('D26: cancelar e gravar o motivo no MESMO UPDATE é permitido', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`update agendamentos set status = 'CANCELADO', motivo_cancelamento = 'Motivo de teste' where id = $1`, [AG.simultaneoCabelo]);
      return primeiro(await tx.consultar<{ status: string; motivo_cancelamento: string | null }>('select status, motivo_cancelamento from agendamentos where id = $1', [AG.simultaneoCabelo]));
    });
    expect(r).toEqual({ status: 'CANCELADO', motivo_cancelamento: 'Motivo de teste' });
  });

  it('D26: cancelar sem informar motivo deixa motivo_cancelamento nulo; o cancelado do seed tem motivo nulo', async () => {
    const r = await banco.comoSuperusuario(async (tx) => {
      await tx.consultar(`update agendamentos set status = 'CANCELADO' where id = $1`, [AG.simultaneoCabelo]);
      return {
        novo: primeiro(await tx.consultar<{ motivo_cancelamento: string | null }>('select motivo_cancelamento from agendamentos where id = $1', [AG.simultaneoCabelo])),
        seed: primeiro(await tx.consultar<{ motivo_cancelamento: string | null }>('select motivo_cancelamento from agendamentos where id = $1', [AG.cancelado])),
      };
    });
    expect(r.novo.motivo_cancelamento).toBeNull();
    expect(r.seed.motivo_cancelamento).toBeNull();
  });

  it('RN15: atualização sem tocar nas colunas protegidas continua permitida (nome/telefone, nome do tenant)', async () => {
    const u = await comoAuth(U.cliente, (tx) =>
      tx.consultar<{ nome: string }>(`update usuarios set nome = 'Carla S.' where id = $1 returning nome`, [U.cliente]),
    );
    expect(primeiro(u).nome).toBe('Carla S.');
    const t = await comoAuth(U.admin, (tx) =>
      tx.consultar<{ nome: string }>(`update tenants set nome = 'Serena' where id = $1 returning nome`, [T.a]),
    );
    expect(primeiro(t).nome).toBe('Serena');
  });
});
