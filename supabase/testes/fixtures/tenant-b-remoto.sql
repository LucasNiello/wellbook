-- Tenant B no Supabase remoto, só para verificar o isolamento entre tenants (RN15).
-- Adaptado de supabase/testes/fixtures/tenant-b.sql, SEM o insert direto em auth.users:
-- as contas admin-b@, prof-b@ e cliente-b@example.com são criadas antes pela Admin API
-- (mesma senha do seed, SEED_SENHA).
-- Rodar no SQL Editor DEPOIS do seed.sql. Bloco único: se falhar, nada é gravado.
do $$
declare
  v_admin_b   uuid := (select id from auth.users where email = 'admin-b@example.com');
  v_prof_b    uuid := (select id from auth.users where email = 'prof-b@example.com');
  v_cliente_b uuid := (select id from auth.users where email = 'cliente-b@example.com');
  v_hoje timestamp := date_trunc('day', privado.para_local(now()));
begin
  if v_admin_b is null or v_prof_b is null or v_cliente_b is null then
    raise exception 'Crie antes as contas admin-b, prof-b e cliente-b.';
  end if;

  insert into public.tenants (id, nome, slug, tema, prazo_cancelamento_min)
  values ('bbbbbbbb-1111-4111-8111-111111111111', 'Estúdio Aurora', 'estudio-aurora', 'onix', 0);

  insert into public.membros_tenant (tenant_id, usuario_id, papel)
  values ('bbbbbbbb-1111-4111-8111-111111111111', v_admin_b, 'admin');

  insert into public.profissionais (id, tenant_id, usuario_id, especialidade, percentual_repasse)
  values ('bbbbbbbb-2222-4222-8222-000000000001', 'bbbbbbbb-1111-4111-8111-111111111111', v_prof_b, 'Terapeuta', 5000);

  insert into public.servicos (id, tenant_id, nome, duracao_min, preco) values
    ('bbbbbbbb-3333-4333-8333-000000000001', 'bbbbbbbb-1111-4111-8111-111111111111', 'Massagem relaxante', 60, 16000),
    ('bbbbbbbb-3333-4333-8333-000000000002', 'bbbbbbbb-1111-4111-8111-111111111111', 'Reflexologia',       30,  9000);

  insert into public.profissional_servicos (tenant_id, profissional_id, servico_id) values
    ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-000000000001', 'bbbbbbbb-3333-4333-8333-000000000001'),
    ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-000000000001', 'bbbbbbbb-3333-4333-8333-000000000002');

  insert into public.horarios_atendimento (tenant_id, profissional_id, dia_semana, hora_inicio, hora_fim)
  select 'bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-000000000001', d, '06:00', '23:00'
  from generate_series(0, 6) as d;

  insert into public.agendamentos (id, tenant_id, cliente_id, profissional_id, inicio, fim, status)
  values ('bbbbbbbb-4444-4444-8444-000000000001', 'bbbbbbbb-1111-4111-8111-111111111111', v_cliente_b,
          'bbbbbbbb-2222-4222-8222-000000000001',
          privado.de_local(v_hoje + interval '5 days 10:00'),
          privado.de_local(v_hoje + interval '5 days 11:00'), 'AGENDADO');

  insert into public.agendamento_servicos (tenant_id, agendamento_id, servico_id)
  values ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-4444-4444-8444-000000000001',
          'bbbbbbbb-3333-4333-8333-000000000001');

  insert into public.observacoes_agendamento (tenant_id, agendamento_id, texto)
  values ('bbbbbbbb-1111-4111-8111-111111111111', 'bbbbbbbb-4444-4444-8444-000000000001', 'Tenho dor lombar.');
end;
$$;
