-- Wellbook · seed de demonstração (D18: só DADOS; as contas são criadas antes pelo script
-- supabase/scripts/criar-usuarios-seed.ts, que lê a senha de SEED_SENHA no .env).
--
-- Ordem: 1) migrations  2) script de usuários  3) este arquivo (SQL Editor, como postgres).
-- Os usuários são encontrados pelo e-mail. As datas são relativas a "hoje" (horário de Brasília).
--
-- Conteúdo: 1 tenant demo; admin que também atende + 3 profissionais de áreas diferentes;
-- 6 serviços; expediente com 2 períodos por dia; 1 cliente; agendamentos em todos
-- os estados, incluindo 2 simultâneos do mesmo cliente com profissionais diferentes.

do $$
declare
  v_super uuid := (select id from auth.users where email = 'superadmin@example.com');
  v_admin uuid := (select id from auth.users where email = 'admin@example.com');
  v_cabelo uuid := (select id from auth.users where email = 'cabelo@example.com');
  v_manicure uuid := (select id from auth.users where email = 'manicure@example.com');
  v_psico uuid := (select id from auth.users where email = 'psicologa@example.com');
  v_cliente uuid := (select id from auth.users where email = 'cliente@example.com');
  -- Meia-noite local de hoje, como timestamp local (−03:00).
  v_hoje timestamp := date_trunc('day', privado.para_local(now()));
  -- Datas futuras sempre de segunda a sábado (expediente do seed): pula o domingo.
  v_d2 timestamp := v_hoje + interval '2 days' + case when extract(dow from v_hoje + interval '2 days') = 0 then interval '1 day' else interval '0' end;
  v_d3 timestamp := v_d2 + interval '1 day' + case when extract(dow from v_d2 + interval '1 day') = 0 then interval '1 day' else interval '0' end;
begin
  if v_super is null or v_admin is null or v_cabelo is null or v_manicure is null
     or v_psico is null or v_cliente is null then
    raise exception 'Rode antes o script de usuários (supabase/scripts/criar-usuarios-seed.ts).';
  end if;

  update public.usuarios set super_admin = true where id = v_super;
  update public.usuarios set telefone = '11988887777' where id = v_cliente and telefone is null;

  -- Tenant ----------------------------------------------------------------------------------
  insert into public.tenants (id, nome, slug, tema, whatsapp, endereco, prazo_cancelamento_min)
  values ('11111111-1111-4111-8111-111111111111', 'Clínica Serena', 'clinica-serena', 'salvia',
          '5511999990000', 'Rua das Acácias, 120 — São Paulo/SP', 120);

  insert into public.membros_tenant (tenant_id, usuario_id, papel)
  values ('11111111-1111-4111-8111-111111111111', v_admin, 'admin');

  -- Profissionais (o admin também atende — seção 7.1) ---------------------------------------
  insert into public.profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse) values
    ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-111111111111', v_admin,    'Esteticista',   0),
    ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-111111111111', v_cabelo,   'Cabeleireiro',  3000),
    ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-111111111111', v_manicure, 'Manicure',      4000),
    ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-111111111111', v_psico,    'Psicóloga',     2500);

  -- Serviços (preço em centavos) ------------------------------------------------------------
  insert into public.servicos (id, tenant_id, nome, duracao_min, preco) values
    ('33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-111111111111', 'Corte de cabelo',        60, 15000),
    ('33333333-3333-4333-8333-000000000002', '11111111-1111-4111-8111-111111111111', 'Escova',                 30,  7000),
    ('33333333-3333-4333-8333-000000000003', '11111111-1111-4111-8111-111111111111', 'Manicure',               45,  6000),
    ('33333333-3333-4333-8333-000000000004', '11111111-1111-4111-8111-111111111111', 'Pedicure',               45,  7000),
    ('33333333-3333-4333-8333-000000000005', '11111111-1111-4111-8111-111111111111', 'Limpeza de pele',        60, 18000),
    ('33333333-3333-4333-8333-000000000006', '11111111-1111-4111-8111-111111111111', 'Sessão de psicoterapia', 50, 20000);

  insert into public.profissional_servicos (tenant_id, profissional_id, servico_id) values
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000001', '33333333-3333-4333-8333-000000000005'),
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000002', '33333333-3333-4333-8333-000000000001'),
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000002', '33333333-3333-4333-8333-000000000002'),
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000003', '33333333-3333-4333-8333-000000000003'),
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000003', '33333333-3333-4333-8333-000000000004'),
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006');

  -- Expediente: segunda a sábado, 09:00–12:00 e 13:00–18:00 (D6: 2 períodos no dia) ----------
  insert into public.horarios_atendimento (tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
  select '11111111-1111-4111-8111-111111111111', p.id, d, h.ini, h.fim
  from (values ('22222222-2222-4222-8222-000000000001'::uuid), ('22222222-2222-4222-8222-000000000002'::uuid),
               ('22222222-2222-4222-8222-000000000003'::uuid), ('22222222-2222-4222-8222-000000000004'::uuid)) as p (id)
  cross join generate_series(1, 6) as d
  cross join (values ('09:00'::time, '12:00'::time), ('13:00'::time, '18:00'::time)) as h (ini, fim);

  -- Bloqueio: almoço estendido da psicóloga daqui a 2 dias.
  insert into public.bloqueios (tenant_id, profissional_id, inicio, fim, motivo) values
    ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-000000000004',
     privado.de_local(v_d2 + interval '13:00'), privado.de_local(v_d2 + interval '14:00'),
     'Consulta médica');

  -- Agendamentos (inseridos direto pelo seed; em uso real só pelas RPCs) ---------------------
  insert into public.agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status) values
    -- CONCLUIDO há 3 dias: corte + escova = R$ 220,00 (exemplo da RN09)
    ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-111111111111', v_cliente,
     '22222222-2222-4222-8222-000000000002',
     privado.de_local(v_hoje - interval '3 days' + interval '10:00'),
     privado.de_local(v_hoje - interval '3 days' + interval '11:30'), 'CONCLUIDO'),
    -- CANCELADO há 2 dias
    ('44444444-4444-4444-8444-000000000002', '11111111-1111-4111-8111-111111111111', v_cliente,
     '22222222-2222-4222-8222-000000000003',
     privado.de_local(v_hoje - interval '2 days' + interval '14:00'),
     privado.de_local(v_hoje - interval '2 days' + interval '14:45'), 'CANCELADO'),
    -- NAO_COMPARECEU ontem (com a admin, que também atende)
    ('44444444-4444-4444-8444-000000000003', '11111111-1111-4111-8111-111111111111', v_cliente,
     '22222222-2222-4222-8222-000000000001',
     privado.de_local(v_hoje - interval '1 day' + interval '09:00'),
     privado.de_local(v_hoje - interval '1 day' + interval '10:00'), 'NAO_COMPARECEU'),
    -- AGENDADO daqui a 2 dias (psicoterapia, com observação — RN11)
    ('44444444-4444-4444-8444-000000000004', '11111111-1111-4111-8111-111111111111', v_cliente,
     '22222222-2222-4222-8222-000000000004',
     privado.de_local(v_d2 + interval '10:00'),
     privado.de_local(v_d2 + interval '10:50'), 'AGENDADO'),
    -- 2 AGENDADOS simultâneos do mesmo cliente com profissionais diferentes (seção 7.1)
    ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-111111111111', v_cliente,
     '22222222-2222-4222-8222-000000000002',
     privado.de_local(v_d3 + interval '14:00'),
     privado.de_local(v_d3 + interval '15:00'), 'AGENDADO'),
    ('44444444-4444-4444-8444-000000000006', '11111111-1111-4111-8111-111111111111', v_cliente,
     '22222222-2222-4222-8222-000000000003',
     privado.de_local(v_d3 + interval '14:00'),
     privado.de_local(v_d3 + interval '14:45'), 'AGENDADO');

  insert into public.agendamento_servicos (tenant_id, agendamento_id, servico_id) values
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000001'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000002'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000003'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000005'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000006'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000005', '33333333-3333-4333-8333-000000000001'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000006', '33333333-3333-4333-8333-000000000003');

  -- Observações (RN11: só cliente e profissional do atendimento leem)
  insert into public.observacoes_agendamento (tenant_id, agendamento_id, texto) values
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000004',
     'Gostaria de conversar sobre crises de ansiedade.'),
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000005',
     'Cabelo cacheado, prefiro corte a seco.');

  -- Conclusão do exemplo da RN09: 22000 − 2000 = 20000; 30% → clínica 6000, profissional 14000
  insert into public.conclusoes (tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido,
    forma_pagamento, percentual_repasse, valor_clinica, valor_profissional, concluido_em) values
    ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-000000000001',
     22000, -2000, 20000, 'pix', 3000, 6000, 14000,
     privado.de_local(v_hoje - interval '3 days' + interval '11:35'));
end;
$$;
