-- Só para os testes: um SEGUNDO tenant e um segundo cliente, para provar o isolamento (RN15).
-- Tenant B tem expediente todos os dias, das 06:00 às 23:00, para facilitar testes de RPC.
-- Contas criadas como pela Admin API (DPc7): raw_app_meta_data.criado_pela_clinica = true.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'admin-b@example.com',   '{"nome": "Bruno Aurora"}', '{"criado_pela_clinica": true}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'prof-b@example.com',    '{"nome": "Bianca Reis"}', '{"criado_pela_clinica": true}'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'cliente-b@example.com', '{"nome": "Diego Souza", "telefone": "11966660000"}', '{"criado_pela_clinica": true}');

insert into public.tenants (id, nome, slug, tema, prazo_cancelamento_min)
values ('bbbbbbbb-1111-4111-8111-111111111111', 'Estúdio Aurora', 'estudio-aurora', 'onix', 0);

insert into public.membros_tenant (tenant_id, usuario_id)
values ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse)
values ('bbbbbbbb-2222-4222-8222-000000000001', 'bbbbbbbb-1111-4111-8111-111111111111',
        'bbbbbbbb-0000-4000-8000-000000000002', 'Terapeuta', 5000);

insert into public.servicos (id, tenant_id, nome, duracao_min, preco) values
  ('bbbbbbbb-3333-4333-8333-000000000001', 'bbbbbbbb-1111-4111-8111-111111111111', 'Massagem relaxante', 60, 16000),
  ('bbbbbbbb-3333-4333-8333-000000000002', 'bbbbbbbb-1111-4111-8111-111111111111', 'Reflexologia',       30,  9000);

insert into public.profissional_servicos (tenant_id, profissional_id, servico_id) values
  ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-000000000001', 'bbbbbbbb-3333-4333-8333-000000000001'),
  ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-000000000001', 'bbbbbbbb-3333-4333-8333-000000000002');

insert into public.horarios_atendimento (tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
select 'bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-000000000001', d, '06:00', '23:00'
from generate_series(0, 6) as d;

-- Um agendamento futuro do cliente B no tenant B, com observação.
insert into public.agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
values ('bbbbbbbb-4444-4444-8444-000000000001', 'bbbbbbbb-1111-4111-8111-111111111111',
        'bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-2222-4222-8222-000000000001',
        privado.de_local(date_trunc('day', privado.para_local(now())) + interval '5 days 10:00'),
        privado.de_local(date_trunc('day', privado.para_local(now())) + interval '5 days 11:00'),
        'AGENDADO');
insert into public.agendamento_servicos (tenant_id, agendamento_id, servico_id)
values ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-4444-4444-8444-000000000001',
        'bbbbbbbb-3333-4333-8333-000000000001');
insert into public.observacoes_agendamento (tenant_id, agendamento_id, texto)
values ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-4444-4444-8444-000000000001',
        'Tenho dor lombar.');
