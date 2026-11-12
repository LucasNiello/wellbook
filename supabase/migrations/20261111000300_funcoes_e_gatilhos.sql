-- Wellbook · 0300 · funções auxiliares (schema privado) e gatilhos
-- As funções usadas nas políticas são SECURITY DEFINER para consultar outras tabelas sem
-- recursão de RLS. Todas usam search_path vazio e nomes qualificados.

-- Fuso (F2-08): −03:00 fixo, mesma regra de packages/shared/src/regras/fuso.ts ---------------
create function privado.para_local(p_instante timestamptz)
returns timestamp
language sql immutable
set search_path = ''
as $$ select (p_instante at time zone 'UTC') - interval '3 hours' $$;

create function privado.de_local(p_local timestamp)
returns timestamptz
language sql immutable
set search_path = ''
as $$ select (p_local + interval '3 hours') at time zone 'UTC' $$;

create function privado.uuid_ou_nulo(p_texto text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when p_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then p_texto::uuid
  end
$$;

-- Perfis --------------------------------------------------------------------------------------
create function privado.eh_super_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select u.super_admin from public.usuarios u where u.id = auth.uid()), false)
$$;

create function privado.eh_admin_do_tenant(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros_tenant m
    where m.tenant_id = p_tenant and m.usuario_id = auth.uid() and m.papel = 'admin'
  )
$$;

-- O usuário logado é o profissional p_profissional, ATIVO (F2-19: profissional desativado perde
-- o acesso a agenda, observações e clientes; o histórico continua visível ao admin).
create function privado.eh_profissional(p_profissional uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profissionais p
    where p.id = p_profissional and p.usuario_id = auth.uid() and p.ativo
  )
$$;

create function privado.eh_profissional_do_tenant(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profissionais p
    where p.tenant_id = p_tenant and p.usuario_id = auth.uid() and p.ativo
  )
$$;

create function privado.tenant_ativo(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.tenants t where t.id = p_tenant and t.ativo) $$;

-- O usuário logado é o cliente ou o profissional do agendamento (RN11: NÃO inclui o admin).
create function privado.eh_participante(p_agendamento uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agendamentos a
    join public.profissionais p on p.id = a.profissional_id
    where a.id = p_agendamento
      and (a.cliente_id = auth.uid() or (p.usuario_id = auth.uid() and p.ativo))
  )
$$;

-- Autor da conclusão, ATIVO OU NÃO (F2-23): o profissional autônomo desligado mantém a leitura
-- das próprias conclusões para o acerto de contas com a clínica. Usada SÓ na política de conclusoes.
create function privado.eh_autor_da_conclusao(p_agendamento uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agendamentos a
    join public.profissionais p on p.id = a.profissional_id
    where a.id = p_agendamento and p.usuario_id = auth.uid()
  )
$$;

-- Visibilidade de linhas de usuarios (F2-03) --------------------------------------------------
create function privado.eh_cliente_do_profissional(p_usuario uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agendamentos a
    join public.profissionais p on p.id = a.profissional_id
    where a.cliente_id = p_usuario and p.usuario_id = auth.uid() and p.ativo
  )
$$;

create function privado.eh_profissional_visivel_ao_admin(p_usuario uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profissionais p
    join public.membros_tenant m
      on m.tenant_id = p.tenant_id and m.usuario_id = auth.uid() and m.papel = 'admin'
    where p.usuario_id = p_usuario
  )
$$;

create function privado.eh_admin_visivel_ao_super(p_usuario uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select privado.eh_super_admin()
     and exists (select 1 from public.membros_tenant m where m.usuario_id = p_usuario)
$$;

-- O cliente logado tem agendamento com este serviço (para ver nome de serviço já desativado).
create function privado.eh_servico_de_agendamento_meu(p_servico uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agendamento_servicos x
    join public.agendamentos a on a.id = x.agendamento_id
    where x.servico_id = p_servico and a.cliente_id = auth.uid()
  )
$$;

-- Gatilho: cria a linha em usuarios quando o Supabase Auth cria a conta -----------------------
-- Lê só nome e telefone dos metadados (que o próprio usuário controla no cadastro).
-- Nunca lê super_admin dos metadados.
create function privado.ao_criar_usuario_auth()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nome, email, telefone)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'telefone'), '')
  );
  return new;
end;
$$;

create trigger ao_criar_usuario_auth
after insert on auth.users
for each row execute function privado.ao_criar_usuario_auth();

-- Gatilho: colunas de usuarios que o próprio usuário não altera (F2-09) ------------------------
create function privado.proteger_colunas_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Só se aplica a chamadas pela API (papéis anon/authenticated). service_role e postgres passam.
  if current_user in ('anon', 'authenticated') then
    if new.id <> old.id
       or new.email <> old.email
       or new.super_admin <> old.super_admin
       or new.provedor_login <> old.provedor_login
       or new.criado_em <> old.criado_em then
      raise exception 'CAMPO_PROTEGIDO: Este dado não pode ser alterado por aqui.';
    end if;
    -- D20 (F2-18): a flag só é zerada pelo gatilho de troca de senha em auth.users.
    if new.troca_senha_obrigatoria <> old.troca_senha_obrigatoria then
      raise exception 'CAMPO_PROTEGIDO: Este dado não pode ser alterado por aqui.';
    end if;
  end if;
  return new;
end;
$$;

create trigger proteger_colunas_usuario
before update on public.usuarios
for each row execute function privado.proteger_colunas_usuario();

-- Gatilho: trocar a senha zera a troca obrigatória (D20, F2-18) --------------------------------
create function privado.ao_trocar_senha_auth()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.usuarios set troca_senha_obrigatoria = false
     where id = new.id and troca_senha_obrigatoria;
  end if;
  return new;
end;
$$;

create trigger ao_trocar_senha_auth
after update of encrypted_password on auth.users
for each row execute function privado.ao_trocar_senha_auth();

-- Gatilho: identidade do profissional é imutável pela API (F2-17) ------------------------------
-- Sem isto, o admin poderia apontar usuario_id para si mesmo e herdar a agenda, as observações
-- (RN11) de outro profissional, ou concluir por ele (RN03).
create function privado.proteger_colunas_profissional()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id <> old.id
       or new.tenant_id <> old.tenant_id
       or new.usuario_id <> old.usuario_id
       or new.criado_em <> old.criado_em then
      raise exception 'CAMPO_PROTEGIDO: O vínculo do profissional não pode ser alterado.';
    end if;
  end if;
  return new;
end;
$$;

create trigger proteger_colunas_profissional
before update on public.profissionais
for each row execute function privado.proteger_colunas_profissional();

-- Gatilho: desativar profissional cancela os agendamentos AGENDADO dele (D26, F2-24) -----------
-- Substitui a trava da D25. Vale para QUALQUER papel (admin pela API, postgres, service_role).
-- Reativar NÃO restaura os agendamentos. O aviso ao cliente por e-mail é da Fase 8.
-- Os cancelados passam pelo gatilho de transição (AGENDADO → CANCELADO) e não somam (RN05).
create function privado.cancelar_pendentes_ao_desativar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.ativo and not new.ativo then
    update public.agendamentos
       set status = 'CANCELADO', motivo_cancelamento = 'Profissional indisponível'
     where profissional_id = new.id and status = 'AGENDADO';
  end if;
  return null;
end;
$$;

create trigger cancelar_pendentes_ao_desativar
after update of ativo on public.profissionais
for each row execute function privado.cancelar_pendentes_ao_desativar();

-- Gatilho: só o Super Admin muda slug e ativo do tenant (F2-09) --------------------------------
-- E o Super Admin não muda tema nem logo (matriz: "Escolher tema e logo" = só o admin).
create function privado.proteger_colunas_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not privado.eh_super_admin() then
    if new.id <> old.id
       or new.slug <> old.slug
       or new.ativo <> old.ativo
       or new.criado_em <> old.criado_em then
      raise exception 'CAMPO_PROTEGIDO: Só o Super Admin altera o link e a situação da clínica.';
    end if;
  end if;
  if current_user in ('anon', 'authenticated') and privado.eh_super_admin()
     and not privado.eh_admin_do_tenant(old.id)
     and (new.tema <> old.tema or new.logo_url is distinct from old.logo_url) then
    raise exception 'CAMPO_PROTEGIDO: Tema e logo são escolhidos pelo admin da clínica.';
  end if;
  return new;
end;
$$;

create trigger proteger_colunas_tenant
before update on public.tenants
for each row execute function privado.proteger_colunas_tenant();

-- Gatilho: máquina de estados do agendamento (CLAUDE.md 5.2) — vale para QUALQUER update -------
create function privado.validar_transicao_agendamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'AGENDADO' then
    raise exception 'ESTADO_FINAL: Este agendamento já foi encerrado e não pode mais ser alterado.';
  end if;

  if new.id <> old.id
     or new.tenant_id <> old.tenant_id
     or new.cliente_id <> old.cliente_id
     or new.profissional_id <> old.profissional_id
     or new.criado_em <> old.criado_em then
    raise exception 'CAMPO_PROTEGIDO: Só data e hora podem ser remarcadas.';
  end if;

  -- D26: o motivo só é gravado junto com o cancelamento.
  if new.motivo_cancelamento is distinct from old.motivo_cancelamento and new.status <> 'CANCELADO' then
    raise exception 'CAMPO_PROTEGIDO: O motivo só pode ser gravado ao cancelar.';
  end if;

  -- Remarcar muda só data/hora e mantém AGENDADO (D14); não se remarca e encerra ao mesmo tempo.
  if (new.inicio <> old.inicio or new.fim <> old.fim) and new.status <> 'AGENDADO' then
    raise exception 'TRANSICAO_INVALIDA: Transição de estado inválida.';
  end if;

  -- Concluir é atômico: a linha em conclusoes precisa existir na mesma transação.
  if new.status = 'CONCLUIDO'
     and not exists (select 1 from public.conclusoes c where c.agendamento_id = new.id) then
    raise exception 'TRANSICAO_INVALIDA: Use concluir_atendimento para concluir.';
  end if;

  return new;
end;
$$;

create trigger validar_transicao_agendamento
before update on public.agendamentos
for each row execute function privado.validar_transicao_agendamento();
