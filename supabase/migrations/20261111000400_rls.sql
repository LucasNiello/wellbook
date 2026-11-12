-- Wellbook · 0400 · Row Level Security de todas as tabelas + privilégios
-- Perfis: Super Admin (usuarios.super_admin), Admin (membros_tenant), Profissional
-- (profissionais.usuario_id), Cliente (agendamentos.cliente_id), anon (página pública).
-- Escritas em agendamentos/observações/conclusões: só pelas RPCs (F2-01).

alter table public.tenants enable row level security;
alter table public.usuarios enable row level security;
alter table public.membros_tenant enable row level security;
alter table public.profissionais enable row level security;
alter table public.servicos enable row level security;
alter table public.profissional_servicos enable row level security;
alter table public.horarios_atendimento enable row level security;
alter table public.bloqueios enable row level security;
alter table public.agendamentos enable row level security;
alter table public.agendamento_servicos enable row level security;
alter table public.observacoes_agendamento enable row level security;
alter table public.conclusoes enable row level security;
alter table public.dispositivos_push enable row level security;

-- Privilégios (F2-06) --------------------------------------------------------------------------
-- O Supabase concede ALL (inclusive TRUNCATE, que ignora RLS) a anon e authenticated.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on public.tenants, public.servicos, public.profissional_servicos,
  public.horarios_atendimento to anon;

-- tenants ---------------------------------------------------------------------------------------
create policy tenants_vitrine on public.tenants
  for select to anon, authenticated
  using (ativo);  -- D21/D23: lista e página pública só de clínicas ativas

create policy tenants_membros on public.tenants
  for select to authenticated
  using (privado.eh_super_admin() or privado.eh_admin_do_tenant(id)
         or privado.eh_profissional_do_tenant(id));

create policy tenants_super_insere on public.tenants
  for insert to authenticated
  with check (privado.eh_super_admin());

-- O admin edita a própria clínica; slug e ativo são protegidos por gatilho (F2-09).
create policy tenants_atualiza on public.tenants
  for update to authenticated
  using (privado.eh_super_admin() or privado.eh_admin_do_tenant(id))
  with check (privado.eh_super_admin() or privado.eh_admin_do_tenant(id));
-- Sem DELETE: tenant é desativado (RF07, D23).

-- usuarios (F2-03) ------------------------------------------------------------------------------
create policy usuarios_leitura on public.usuarios
  for select to authenticated
  using (
    id = auth.uid()
    or privado.eh_cliente_do_profissional(id)
    or privado.eh_profissional_visivel_ao_admin(id)
    or privado.eh_admin_visivel_ao_super(id)
  );

create policy usuarios_atualiza_proprio on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- INSERT pelo gatilho do auth.users; exclusão/anonimização na Fase 3 (D22).

-- membros_tenant --------------------------------------------------------------------------------
create policy membros_leitura on public.membros_tenant
  for select to authenticated
  using (usuario_id = auth.uid() or privado.eh_admin_do_tenant(tenant_id)
         or privado.eh_super_admin());

-- O Super Admin não acessa dados operacionais: não pode se tornar admin de um tenant (F2-17).
create policy membros_super_insere on public.membros_tenant
  for insert to authenticated
  with check (privado.eh_super_admin() and usuario_id <> auth.uid());

create policy membros_super_remove on public.membros_tenant
  for delete to authenticated
  using (privado.eh_super_admin());

-- profissionais ---------------------------------------------------------------------------------
-- A vitrine pública usa a view profissionais_publicos (só nome, especialidade e avatar).
create policy profissionais_leitura on public.profissionais
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id) or usuario_id = auth.uid());

-- RN10: só o admin altera (inclusive a %). Vínculo (usuario_id/tenant_id) imutável: F2-17.
-- Pela API o admin só cadastra A SI MESMO ("eu também atendo", seção 7.1). Os demais
-- profissionais são criados pela Edge Function da D20 (service role), que cria a conta junto.
create policy profissionais_admin_insere on public.profissionais
  for insert to authenticated
  with check (privado.eh_admin_do_tenant(tenant_id) and usuario_id = auth.uid());

create policy profissionais_admin_atualiza on public.profissionais
  for update to authenticated
  using (privado.eh_admin_do_tenant(tenant_id))
  with check (privado.eh_admin_do_tenant(tenant_id));

-- D17: com histórico a FK impede; sem histórico pode apagar.
create policy profissionais_admin_remove on public.profissionais
  for delete to authenticated
  using (privado.eh_admin_do_tenant(tenant_id));

-- servicos --------------------------------------------------------------------------------------
create policy servicos_vitrine on public.servicos
  for select to anon, authenticated
  using (ativo and privado.tenant_ativo(tenant_id));

create policy servicos_internos on public.servicos
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id) or privado.eh_profissional_do_tenant(tenant_id)
         or privado.eh_servico_de_agendamento_meu(id));

create policy servicos_admin_insere on public.servicos
  for insert to authenticated
  with check (privado.eh_admin_do_tenant(tenant_id));

create policy servicos_admin_atualiza on public.servicos
  for update to authenticated
  using (privado.eh_admin_do_tenant(tenant_id))
  with check (privado.eh_admin_do_tenant(tenant_id));

create policy servicos_admin_remove on public.servicos
  for delete to authenticated
  using (privado.eh_admin_do_tenant(tenant_id));

-- profissional_servicos -------------------------------------------------------------------------
create policy prof_servicos_vitrine on public.profissional_servicos
  for select to anon, authenticated
  using (privado.tenant_ativo(tenant_id));

create policy prof_servicos_internos on public.profissional_servicos
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id) or privado.eh_profissional_do_tenant(tenant_id));

create policy prof_servicos_admin_insere on public.profissional_servicos
  for insert to authenticated
  with check (privado.eh_admin_do_tenant(tenant_id));

create policy prof_servicos_admin_remove on public.profissional_servicos
  for delete to authenticated
  using (privado.eh_admin_do_tenant(tenant_id));

-- horarios_atendimento (RF16, D26: só o PRÓPRIO profissional define; o admin só lê) -------------
create policy horarios_vitrine on public.horarios_atendimento
  for select to anon, authenticated
  using (privado.tenant_ativo(tenant_id));

create policy horarios_internos on public.horarios_atendimento
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id) or privado.eh_profissional(profissional_id));

create policy horarios_insere on public.horarios_atendimento
  for insert to authenticated
  with check (privado.eh_profissional(profissional_id));

create policy horarios_atualiza on public.horarios_atendimento
  for update to authenticated
  using (privado.eh_profissional(profissional_id))
  with check (privado.eh_profissional(profissional_id));

create policy horarios_remove on public.horarios_atendimento
  for delete to authenticated
  using (privado.eh_profissional(profissional_id));

-- bloqueios (RF17, D26: só o PRÓPRIO profissional; o admin só lê; o motivo não é público — F2-05)
create policy bloqueios_leitura on public.bloqueios
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id) or privado.eh_profissional(profissional_id));

create policy bloqueios_insere on public.bloqueios
  for insert to authenticated
  with check (privado.eh_profissional(profissional_id));

create policy bloqueios_atualiza on public.bloqueios
  for update to authenticated
  using (privado.eh_profissional(profissional_id))
  with check (privado.eh_profissional(profissional_id));

create policy bloqueios_remove on public.bloqueios
  for delete to authenticated
  using (privado.eh_profissional(profissional_id));

-- agendamentos (só leitura; escrita pelas RPCs) -------------------------------------------------
-- D26/D27: o admin LÊ a agenda de todos os profissionais do tenant, mas não escreve nela.
-- Nome e telefone do cliente chegam ao admin pela view agendamentos_admin (sem e-mail — D16).
create policy agendamentos_leitura on public.agendamentos
  for select to authenticated
  using (
    cliente_id = auth.uid()
    or privado.eh_profissional(profissional_id)
    or privado.eh_admin_do_tenant(tenant_id)
  );

-- agendamento_servicos (admin do tenant e participantes) -----------------------------------------
create policy agendamento_servicos_leitura on public.agendamento_servicos
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id) or privado.eh_participante(agendamento_id));

-- observacoes_agendamento (RN11: só cliente e profissional do atendimento; NUNCA o admin) -------
create policy observacoes_leitura on public.observacoes_agendamento
  for select to authenticated
  using (privado.eh_participante(agendamento_id));

-- conclusoes (admin do tenant e profissional do atendimento) ------------------------------------
-- F2-23: o profissional lê as próprias conclusões mesmo desativado (acerto de contas).
-- conclusoes não tem dado do cliente; observações, agenda e contatos continuam bloqueados.
create policy conclusoes_leitura on public.conclusoes
  for select to authenticated
  using (privado.eh_admin_do_tenant(tenant_id)
         or privado.eh_autor_da_conclusao(agendamento_id));

-- dispositivos_push (por usuário — V2) -----------------------------------------------------------
create policy dispositivos_proprios on public.dispositivos_push
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
