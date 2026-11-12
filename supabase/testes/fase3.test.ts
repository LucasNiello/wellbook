/**
 * Fase 3 no banco: D20 com senha provisória (DP3), consentimento LGPD pelo gatilho (DP2) e
 * exclusão da conta do cliente (D22). Migrations 20261112000100/0200/0300.
 * Todo teste "não pode" tem o controle positivo correspondente (vazio também acontece quando a
 * política bloqueia todo mundo).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { criarBanco, erroDe, IDS, instanteLocal, proximaData, type Banco, type Executor } from './apoio/banco.ts';

const SEG_A_SAB = [1, 2, 3, 4, 5, 6] as const;

const U = IDS.usuarios;
const P = IDS.profissionais;
const S = IDS.servicos;
const AG = IDS.agendamentos;
const T = IDS.tenants;

let banco: Banco;

beforeAll(async () => {
  banco = await criarBanco();
}, 120_000);

afterAll(async () => {
  await banco.fechar();
});

async function contar(tx: Executor, sql: string, parametros?: unknown[]): Promise<number> {
  const linhas = await tx.consultar<{ n: number }>(`select count(*)::int as n from (${sql}) x`, parametros);
  return linhas[0]?.n ?? 0;
}

async function marcarSenhaProvisoria(tx: Executor, usuario: string) {
  await tx.trocarPara('postgres');
  await tx.consultar('update public.usuarios set troca_senha_obrigatoria = true where id = $1', [usuario]);
}

async function darConsentimento(tx: Executor, usuario: string) {
  await tx.trocarPara('postgres');
  await tx.consultar('update public.usuarios set consentimento_lgpd_em = now() where id = $1', [usuario]);
}

/** Cria (como postgres) um AGENDADO do cabeleireiro que começou há 1 hora, para testar concluir. */
async function agendamentoIniciadoDoCabelo(tx: Executor): Promise<string> {
  await tx.trocarPara('postgres');
  const [linha] = await tx.consultar<{ id: string }>(
    `insert into public.agendamentos (tenant_id, cliente_id, profissional_id, inicio, fim, status)
     values ($1, $2, $3, date_trunc('hour', now()) - interval '1 hour', date_trunc('hour', now()), 'AGENDADO')
     returning id`,
    [T.a, U.cliente, P.cabelo],
  );
  await tx.consultar(
    'insert into public.agendamento_servicos (tenant_id, agendamento_id, servico_id) values ($1, $2, $3)',
    [T.a, linha!.id, S.corte],
  );
  return linha!.id;
}

// ---------------------------------------------------------------------------------------------
describe('DP3 · D20 no banco: senha provisória não age como profissional', () => {
  it('controle: com senha definitiva, o cabeleireiro lê a observação e a agenda dele', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      expect(await contar(tx, 'select 1 from public.observacoes_agendamento where agendamento_id = $1', [AG.simultaneoCabelo])).toBe(1);
      expect(await contar(tx, 'select 1 from public.agendamentos where profissional_id = $1', [P.cabelo])).toBeGreaterThan(0);
    });
  });

  it('com senha provisória: não lê observação, agenda nem dados do cliente', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      expect(await contar(tx, 'select 1 from public.observacoes_agendamento')).toBe(0);
      expect(await contar(tx, 'select 1 from public.agendamentos where profissional_id = $1', [P.cabelo])).toBe(0);
      expect(await contar(tx, 'select 1 from public.usuarios where id = $1', [U.cliente])).toBe(0);
      expect(await contar(tx, 'select 1 from public.bloqueios')).toBe(0);
    });
  });

  it('com senha provisória: não cancela nem remarca o atendimento dele', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      const erro = await erroDe(tx.consultar('select public.cancelar_agendamento($1)', [AG.simultaneoCabelo]));
      expect(erro).toMatch(/AGENDAMENTO_NAO_ENCONTRADO|TROCA_SENHA_OBRIGATORIA/);
    });
  });

  it('controle: com senha definitiva, conclui o atendimento já iniciado', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      const id = await agendamentoIniciadoDoCabelo(tx);
      await tx.trocarPara(U.cabelo);
      const [c] = await tx.consultar<{ valor_liquido: number }>(
        `select valor_liquido from public.concluir_atendimento($1, 0, 'pix')`,
        [id],
      );
      expect(c!.valor_liquido).toBe(15000);
    });
  });

  it('com senha provisória: concluir é recusado e nada é gravado', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      const id = await agendamentoIniciadoDoCabelo(tx);
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      const erro = await erroDe(tx.consultar(`select public.concluir_atendimento($1, 0, 'pix')`, [id]));
      expect(erro).toMatch(/TROCA_SENHA_OBRIGATORIA/);
    });
  });

  it('com senha provisória: não marca falta', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      const id = await agendamentoIniciadoDoCabelo(tx);
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      const erro = await erroDe(tx.consultar('select public.marcar_nao_compareceu($1)', [id]));
      expect(erro).toMatch(/AGENDAMENTO_NAO_ENCONTRADO|TROCA_SENHA_OBRIGATORIA/);
    });
  });

  // Revisão da continuação (itens 3 e 4): cada "não pode" com o controle positivo ao lado.
  async function bloqueioDoCabelo(tx: Executor) {
    await tx.trocarPara('postgres');
    await tx.consultar(
      `insert into public.bloqueios (tenant_id, profissional_id, inicio, fim, motivo)
       values ($1, $2, now() + interval '10 days', now() + interval '10 days 1 hour', 'Curso')`,
      [T.a, P.cabelo],
    );
  }

  it('bloqueio do próprio cabeleireiro: lê com senha definitiva, não lê com provisória', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await bloqueioDoCabelo(tx);
      await tx.trocarPara(U.cabelo);
      expect(await contar(tx, 'select 1 from public.bloqueios where profissional_id = $1', [P.cabelo])).toBe(1);
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      expect(await contar(tx, 'select 1 from public.bloqueios where profissional_id = $1', [P.cabelo])).toBe(0);
    });
  });

  it('remarcar: definitiva remarca; provisória é recusada', async () => {
    const novo = instanteLocal(proximaData(SEG_A_SAB, 6), '10:00');
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await tx.consultar('select public.remarcar_agendamento($1, $2)', [AG.simultaneoCabelo, novo]);
    });
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      const erro = await erroDe(tx.consultar('select public.remarcar_agendamento($1, $2)', [AG.simultaneoCabelo, novo]));
      expect(erro).toMatch(/AGENDAMENTO_NAO_ENCONTRADO|TROCA_SENHA_OBRIGATORIA/);
    });
  });

  it('cancelar: controle com senha definitiva funciona', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await tx.consultar('select public.cancelar_agendamento($1)', [AG.simultaneoCabelo]);
    });
  });

  it('criar agendamento (como cliente de outra profissional): definitiva cria; provisória é recusada', async () => {
    const inicio = instanteLocal(proximaData(SEG_A_SAB, 7), '09:00');
    await banco.comoUsuario(U.cabelo, async (tx) => {
      const [r] = await tx.consultar<{ id: string }>(
        'select public.criar_agendamento($1, $2::uuid[], $3) as id',
        [P.manicure, [S.manicure], inicio],
      );
      expect(r!.id).toBeTruthy();
    });
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      const erro = await erroDe(
        tx.consultar('select public.criar_agendamento($1, $2::uuid[], $3)', [P.manicure, [S.manicure], inicio]),
      );
      expect(erro).toMatch(/TROCA_SENHA_OBRIGATORIA/);
    });
  });

  it('horários e bloqueios: definitiva grava os próprios; provisória não insere, não altera, não apaga', async () => {
    const inserirHorario = `insert into public.horarios_atendimento (tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
                            values ($1, $2, 0, '08:00', '09:00')`;
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await tx.consultar(inserirHorario, [T.a, P.cabelo]);
      const r = await tx.consultar(`update public.horarios_atendimento set hora_fim = hora_fim where profissional_id = $1 returning 1`, [P.cabelo]);
      expect(r.length).toBeGreaterThan(0);
    });
    // Cada recusa em transação própria (um erro aborta a transação inteira no Postgres).
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      expect(await erroDe(tx.consultar(inserirHorario, [T.a, P.cabelo]))).toMatch(/row-level security|permission/);
    });
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await bloqueioDoCabelo(tx);
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cabelo);
      const alterados = await tx.consultar(`update public.horarios_atendimento set hora_fim = hora_fim where profissional_id = $1 returning 1`, [P.cabelo]);
      expect(alterados.length).toBe(0);
      const apagados = await tx.consultar('delete from public.bloqueios where profissional_id = $1 returning 1', [P.cabelo]);
      expect(apagados.length).toBe(0);
    });
  });

  it('trocar a senha devolve o acesso (gatilho zera a flag)', async () => {
    await banco.comoUsuario(U.cabelo, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.consultar(`update auth.users set encrypted_password = 'nova' where id = $1`, [U.cabelo]);
      await tx.trocarPara(U.cabelo);
      expect(await contar(tx, 'select 1 from public.observacoes_agendamento where agendamento_id = $1', [AG.simultaneoCabelo])).toBe(1);
    });
  });

  it('a senha provisória de um profissional não afeta os outros', async () => {
    await banco.comoUsuario(U.psicologa, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.psicologa);
      expect(await contar(tx, 'select 1 from public.observacoes_agendamento where agendamento_id = $1', [AG.psicoterapia])).toBe(1);
    });
  });

  it('o cliente continua lendo a própria observação (RN11)', async () => {
    await banco.comoUsuario(U.cliente, async (tx) => {
      await marcarSenhaProvisoria(tx, U.cabelo);
      await tx.trocarPara(U.cliente);
      expect(await contar(tx, 'select 1 from public.observacoes_agendamento')).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('DPc1 · D20 também para o admin', () => {
  const consultasDoAdmin = [
    'select 1 from public.agendamentos_admin',
    'select 1 from public.conclusoes',
    'select 1 from public.membros_tenant where papel = $1',
  ] as const;

  it('controle: com senha definitiva, a Helena vê o painel do tenant', async () => {
    await banco.comoUsuario(U.admin, async (tx) => {
      expect(await contar(tx, consultasDoAdmin[0])).toBe(6);
      expect(await contar(tx, consultasDoAdmin[1])).toBe(1);
      expect(await contar(tx, consultasDoAdmin[2], ['admin'])).toBe(1);
      expect(await contar(tx, 'select 1 from public.usuarios where id = $1', [U.manicure])).toBe(1);
    });
  });

  it('com senha provisória: não vê agenda do admin, conclusões nem a equipe (só a própria linha de membro)', async () => {
    await banco.comoUsuario(U.admin, async (tx) => {
      await marcarSenhaProvisoria(tx, U.admin);
      await tx.trocarPara(U.admin);
      expect(await contar(tx, consultasDoAdmin[0])).toBe(0);
      expect(await contar(tx, consultasDoAdmin[1])).toBe(0);
      // A própria linha continua visível (o app precisa dela para mandar à troca de senha).
      expect(await contar(tx, 'select 1 from public.membros_tenant where usuario_id <> $1', [U.admin])).toBe(0);
      expect(await contar(tx, 'select 1 from public.membros_tenant where usuario_id = $1', [U.admin])).toBe(1);
      expect(await contar(tx, 'select 1 from public.usuarios where id = $1', [U.manicure])).toBe(0);
    });
  });

  it('com senha provisória: criar agendamento é recusado pelo gatilho (o helper de admin já não vale)', async () => {
    const inicio = instanteLocal(proximaData(SEG_A_SAB, 8), '09:00');
    await banco.comoUsuario(U.admin, async (tx) => {
      await marcarSenhaProvisoria(tx, U.admin);
      await tx.trocarPara(U.admin);
      const erro = await erroDe(
        tx.consultar('select public.criar_agendamento($1, $2::uuid[], $3)', [P.manicure, [S.manicure], inicio]),
      );
      expect(erro).toMatch(/TROCA_SENHA_OBRIGATORIA/);
    });
  });

  it('com senha provisória: não altera dados da clínica (controle: com definitiva altera)', async () => {
    const alterar = `update public.tenants set endereco = endereco where id = $1 returning 1`;
    await banco.comoUsuario(U.admin, async (tx) => {
      expect((await tx.consultar(alterar, [T.a])).length).toBe(1);
    });
    await banco.comoUsuario(U.admin, async (tx) => {
      await marcarSenhaProvisoria(tx, U.admin);
      await tx.trocarPara(U.admin);
      expect((await tx.consultar(alterar, [T.a])).length).toBe(0);
    });
  });

  it('com senha provisória: não altera o percentual de repasse (controle: com definitiva altera)', async () => {
    const alterar = 'update public.profissionais set percentual_repasse = 3000 where id = $1 returning 1';
    await banco.comoUsuario(U.admin, async (tx) => {
      expect((await tx.consultar(alterar, [P.cabelo])).length).toBe(1);
    });
    await banco.comoUsuario(U.admin, async (tx) => {
      await marcarSenhaProvisoria(tx, U.admin);
      await tx.trocarPara(U.admin);
      expect((await tx.consultar(alterar, [P.cabelo])).length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('DP2 · RNF05: consentimento gravado pelo gatilho e protegido', () => {
  async function criarConta(tx: Executor, id: string, meta: string): Promise<string | null> {
    await tx.trocarPara('postgres');
    await tx.consultar('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)', [
      id,
      `${id}@example.com`,
      meta,
    ]);
    // A checagem da DPc7 é adiada para o commit; os testes sempre desfazem, então forçamos agora.
    await tx.executar('set constraints all immediate');
    const [u] = await tx.consultar<{ consentimento_lgpd_em: string | null }>(
      'select consentimento_lgpd_em from public.usuarios where id = $1',
      [id],
    );
    return u!.consentimento_lgpd_em;
  }

  it('consentimento_lgpd = true grava a data do servidor', async () => {
    await banco.comoSuperusuario(async (tx) => {
      const data = await criarConta(tx, 'cccccccc-0000-4000-8000-000000000001', '{"nome": "Ana", "consentimento_lgpd": true}');
      expect(data).not.toBeNull();
    });
  });

  it('DPc7: sem o metadado, ou com valor que não é o booleano true, o cadastro é RECUSADO', async () => {
    const casos = [
      ['cccccccc-0000-4000-8000-000000000002', '{"nome": "Bia"}'],
      ['cccccccc-0000-4000-8000-000000000003', '{"nome": "Caio", "consentimento_lgpd": "true"}'],
      ['cccccccc-0000-4000-8000-000000000004', '{"nome": "Duda", "consentimento_lgpd": false}'],
    ] as const;
    for (const [id, meta] of casos) {
      await banco.comoSuperusuario(async (tx) => {
        expect(await erroDe(criarConta(tx, id, meta))).toMatch(/CONSENTIMENTO_OBRIGATORIO/);
      });
    }
  });

  it('DPc7: conta criada pela clínica dispensa o aceite — como a Admin API faz (INSERT, depois app_metadata)', async () => {
    await banco.comoSuperusuario(async (tx) => {
      const id = 'cccccccc-0000-4000-8000-000000000005';
      await tx.consultar(
        `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"nome": "Prof Nova"}'::jsonb)`,
        [id, `${id}@example.com`],
      );
      await tx.consultar(
        `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"criado_pela_clinica": true}'::jsonb where id = $1`,
        [id],
      );
      await tx.executar('set constraints all immediate'); // o "commit" passa

      const [u] = await tx.consultar<{ consentimento_lgpd_em: string | null }>(
        'select consentimento_lgpd_em from public.usuarios where id = $1',
        [id],
      );
      expect(u!.consentimento_lgpd_em).toBeNull();
    });
  });

  it('DPc7: marca da clínica que não é o booleano true (texto "true") não dispensa o aceite', async () => {
    await banco.comoSuperusuario(async (tx) => {
      const id = 'cccccccc-0000-4000-8000-000000000007';
      await tx.consultar(
        `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"nome": "Texto"}'::jsonb)`,
        [id, `${id}@example.com`],
      );
      await tx.consultar(
        `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"criado_pela_clinica": "true"}'::jsonb where id = $1`,
        [id],
      );
      expect(await erroDe(tx.executar('set constraints all immediate'))).toMatch(/CONSENTIMENTO_OBRIGATORIO/);
    });
  });

  it('DPc7: a marca da clínica nos metadados do USUÁRIO não dispensa o aceite', async () => {
    await banco.comoSuperusuario(async (tx) => {
      const erro = await erroDe(
        criarConta(tx, 'cccccccc-0000-4000-8000-000000000006', '{"nome": "Esperto", "criado_pela_clinica": true}'),
      );
      expect(erro).toMatch(/CONSENTIMENTO_OBRIGATORIO/);
    });
  });

  it('o próprio usuário não altera nem apaga a data do consentimento', async () => {
    await banco.comoUsuario(U.cliente, async (tx) => {
      await darConsentimento(tx, U.cliente);
      await tx.trocarPara(U.cliente);
      const alterar = await erroDe(
        tx.consultar(`update public.usuarios set consentimento_lgpd_em = now() - interval '1 day' where id = $1`, [U.cliente]),
      );
      expect(alterar).toMatch(/CAMPO_PROTEGIDO/);
    });
    await banco.comoUsuario(U.cliente, async (tx) => {
      await darConsentimento(tx, U.cliente);
      await tx.trocarPara(U.cliente);
      const apagar = await erroDe(
        tx.consultar('update public.usuarios set consentimento_lgpd_em = null where id = $1', [U.cliente]),
      );
      expect(apagar).toMatch(/CAMPO_PROTEGIDO/);
    });
  });

  it('controle: o próprio usuário continua alterando nome e telefone', async () => {
    await banco.comoUsuario(U.cliente, async (tx) => {
      const r = await tx.consultar<{ nome: string }>(
        `update public.usuarios set nome = 'Carla M.', telefone = '11900000000' where id = $1 returning nome`,
        [U.cliente],
      );
      expect(r[0]!.nome).toBe('Carla M.');
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('D22 · exclusão da conta do cliente', () => {
  it('cancela os AGENDADO futuros, apaga observações, anonimiza e mantém as conclusões', async () => {
    await banco.comoUsuario(U.cliente, async (tx) => {
      await darConsentimento(tx, U.cliente); // para a asserção de "consentimento nulo" não passar por construção
      const conclusoesAntes = await contar(tx, 'select 1 from public.conclusoes');
      await tx.trocarPara(U.cliente);
      await tx.consultar('select public.excluir_minha_conta()');

      await tx.trocarPara('postgres');
      const ags = await tx.consultar<{ id: string; status: string; motivo_cancelamento: string | null }>(
        'select id, status, motivo_cancelamento from public.agendamentos where cliente_id = $1',
        [U.cliente],
      );
      const porId = new Map(ags.map((a) => [a.id, a]));
      for (const futuro of [AG.psicoterapia, AG.simultaneoCabelo, AG.simultaneoManicure]) {
        expect(porId.get(futuro)?.status).toBe('CANCELADO');
        expect(porId.get(futuro)?.motivo_cancelamento).toBe('Conta excluída pelo cliente');
      }
      expect(porId.get(AG.concluido)?.status).toBe('CONCLUIDO');
      expect(porId.get(AG.naoCompareceu)?.status).toBe('NAO_COMPARECEU');
      expect(porId.get(AG.cancelado)?.motivo_cancelamento).toBeNull();

      expect(
        await contar(
          tx,
          'select 1 from public.observacoes_agendamento o join public.agendamentos a on a.id = o.agendamento_id where a.cliente_id = $1',
          [U.cliente],
        ),
      ).toBe(0);
      expect(await contar(tx, 'select 1 from public.conclusoes')).toBe(conclusoesAntes);

      const [u] = await tx.consultar<{ nome: string; email: string; telefone: string | null; consentimento_lgpd_em: string | null }>(
        'select nome, email, telefone, consentimento_lgpd_em from public.usuarios where id = $1',
        [U.cliente],
      );
      expect(u!.nome).toBe('Cliente removido');
      expect(u!.email).toBe(`removido-${U.cliente}@anonimo.invalid`);
      expect(u!.telefone).toBeNull();
      expect(u!.consentimento_lgpd_em).toBeNull();
    });
  });

  it('não toca em dados de outro cliente nem do outro tenant', async () => {
    await banco.comoUsuario(U.cliente, async (tx) => {
      await tx.consultar('select public.excluir_minha_conta()');
      await tx.trocarPara('postgres');
      const [b] = await tx.consultar<{ status: string }>('select status from public.agendamentos where id = $1', [AG.b]);
      expect(b!.status).toBe('AGENDADO');
      expect(await contar(tx, 'select 1 from public.observacoes_agendamento where agendamento_id = $1', [AG.b])).toBe(1);
      const [cb] = await tx.consultar<{ nome: string }>('select nome from public.usuarios where id = $1', [U.clienteB]);
      expect(cb!.nome).toBe('Diego Souza');
    });
  });

  it('o AGENDADO que já começou não é cancelado (fica para o profissional encerrar)', async () => {
    await banco.comoUsuario(U.cliente, async (tx) => {
      const id = await agendamentoIniciadoDoCabelo(tx);
      await tx.trocarPara(U.cliente);
      await tx.consultar('select public.excluir_minha_conta()');
      await tx.trocarPara('postgres');
      const [a] = await tx.consultar<{ status: string }>('select status from public.agendamentos where id = $1', [id]);
      expect(a!.status).toBe('AGENDADO');
    });
  });

  it('contas de admin, profissional e super admin recebem CONTA_COM_VINCULO', async () => {
    for (const usuario of [U.admin, U.cabelo, U.superAdmin]) {
      await banco.comoUsuario(usuario, async (tx) => {
        expect(await erroDe(tx.consultar('select public.excluir_minha_conta()'))).toMatch(/CONTA_COM_VINCULO/);
      });
    }
  });

  it('visitante sem login não executa', async () => {
    await banco.comoAnonimo(async (tx) => {
      expect(await erroDe(tx.consultar('select public.excluir_minha_conta()'))).toMatch(
        /permission denied|NAO_AUTENTICADO/,
      );
    });
  });
});
