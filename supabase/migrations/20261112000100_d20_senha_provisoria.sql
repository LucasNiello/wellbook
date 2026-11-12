-- Wellbook · 20261112000100 · D20 no banco (DP3, aprovada pelo Lucas em 12/11)
-- Quem ainda está com a senha PROVISÓRIA (usuarios.troca_senha_obrigatoria) não age como
-- profissional: não lê agenda, observações nem clientes, e não cria/conclui/cancela/remarca/marca
-- falta. Fecha o atalho "logar pela API com a senha que o admin conhece" (revisão da Fase 3, item 2).
-- O papel admin NÃO foi alterado aqui (fora do escopo aprovado; ver registro de decisões).

-- O usuário logado ainda precisa trocar a senha provisória? (false para anon/postgres/service_role)
create function privado.senha_provisoria()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select u.troca_senha_obrigatoria from public.usuarios u where u.id = auth.uid()),
    false
  )
$$;

-- Helpers de profissional passam a exigir senha definitiva ------------------------------------
create or replace function privado.eh_profissional(p_profissional uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profissionais p
    where p.id = p_profissional and p.usuario_id = auth.uid() and p.ativo
  ) and not privado.senha_provisoria()
$$;

create or replace function privado.eh_profissional_do_tenant(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profissionais p
    where p.tenant_id = p_tenant and p.usuario_id = auth.uid() and p.ativo
  ) and not privado.senha_provisoria()
$$;

-- RN11 continua: cliente OU profissional do atendimento; o ramo do profissional exige senha definitiva.
create or replace function privado.eh_participante(p_agendamento uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agendamentos a
    join public.profissionais p on p.id = a.profissional_id
    where a.id = p_agendamento
      and (
        a.cliente_id = auth.uid()
        or (p.usuario_id = auth.uid() and p.ativo and not privado.senha_provisoria())
      )
  )
$$;

create or replace function privado.eh_cliente_do_profissional(p_usuario uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agendamentos a
    join public.profissionais p on p.id = a.profissional_id
    where a.cliente_id = p_usuario and p.usuario_id = auth.uid() and p.ativo
  ) and not privado.senha_provisoria()
$$;

-- Escritas: TODAS as RPCs que mexem em agendamentos (criar, concluir, cancelar, remarcar, falta)
-- passam por INSERT/UPDATE em public.agendamentos. Um gatilho só cobre as cinco, inclusive
-- concluir_atendimento (que confere o profissional por conta própria).
create function privado.exigir_senha_definitiva()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if privado.senha_provisoria() then
    raise exception 'TROCA_SENHA_OBRIGATORIA: Troque sua senha provisória antes de continuar.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger exigir_senha_definitiva
before insert or update on public.agendamentos
for each row execute function privado.exigir_senha_definitiva();
