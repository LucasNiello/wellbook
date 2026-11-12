-- Wellbook · 0500 · RPCs do agendamento
-- Todas SECURITY DEFINER com search_path vazio. Erros no formato "CODIGO: mensagem" (F2-12).
-- As regras espelham packages/shared/src/regras (valores.ts, transicoes.ts, horarios-livres.ts).

-- Validação de horário (RN12, RN13, D5, D6, D12) — uso interno ---------------------------------
create function privado.validar_horario(
  p_profissional uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ignorar_agendamento uuid
)
returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_ini_local timestamp := privado.para_local(p_inicio);
  v_fim_local timestamp := privado.para_local(p_fim);
  v_dia date := v_ini_local::date;
begin
  if p_inicio <= now() then
    raise exception 'HORARIO_PASSADO: Escolha um horário no futuro.';
  end if;

  -- D5: grade de 15 em 15 minutos.
  if extract(second from p_inicio) <> 0 or extract(minute from p_inicio)::int % 15 <> 0 then
    raise exception 'HORARIO_FORA_DA_GRADE: Os horários são de 15 em 15 minutos.';
  end if;

  -- Expediente (D6: qualquer um dos períodos do dia; o atendimento cabe inteiro no período).
  if not exists (
    select 1 from public.horarios_atendimento h
    where h.profissional_id = p_profissional
      and h.dia_semana = extract(dow from v_dia)::int
      and v_dia + h.hora_inicio <= v_ini_local
      and v_fim_local <= v_dia + h.hora_fim
  ) then
    raise exception 'FORA_DO_EXPEDIENTE: Horário fora do expediente do profissional.';
  end if;

  if exists (
    select 1 from public.bloqueios b
    where b.profissional_id = p_profissional
      and tstzrange(b.inicio, b.fim, '[)') && tstzrange(p_inicio, p_fim, '[)')
  ) then
    raise exception 'HORARIO_BLOQUEADO: O profissional não atende neste horário.';
  end if;

  -- D12: AGENDADO, CONCLUIDO e NAO_COMPARECEU ocupam; CANCELADO libera.
  if exists (
    select 1 from public.agendamentos a
    where a.profissional_id = p_profissional
      and a.status <> 'CANCELADO'
      and (p_ignorar_agendamento is null or a.id <> p_ignorar_agendamento)
      and tstzrange(a.inicio, a.fim, '[)') && tstzrange(p_inicio, p_fim, '[)')
  ) then
    raise exception 'HORARIO_INDISPONIVEL: Este horário acabou de ser ocupado. Escolha outro.';
  end if;
end;
$$;
revoke all on function privado.validar_horario(uuid, timestamptz, timestamptz, uuid) from public;

-- criar_agendamento (V3; RF06, RF19–RF22, RN12–RN14, D23, D26) ---------------------------------
create function public.criar_agendamento(
  p_profissional_id uuid,
  p_servico_ids uuid[],
  p_inicio timestamptz,
  p_observacao text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_prof public.profissionais%rowtype;
  v_qtd int;
  v_qtd_validos int;
  v_duracao int;
  v_fim timestamptz;
  v_obs text := nullif(btrim(p_observacao), '');
  v_id uuid;
begin
  if v_usuario is null or not exists (select 1 from public.usuarios u where u.id = v_usuario) then
    raise exception 'NAO_AUTENTICADO: Faça login para agendar.';
  end if;

  -- FOR SHARE (F2-24): espera um "desativar" em andamento terminar e relê `ativo`; sem isso,
  -- desativar e agendar ao mesmo tempo deixariam um AGENDADO para profissional inativo (D25).
  select * into v_prof from public.profissionais p where p.id = p_profissional_id for share;
  if not found or not v_prof.ativo then
    raise exception 'PROFISSIONAL_INDISPONIVEL: Profissional indisponível.';
  end if;

  if not privado.tenant_ativo(v_prof.tenant_id) then
    raise exception 'CLINICA_INDISPONIVEL: Esta clínica não está aceitando agendamentos.';
  end if;

  -- D26: o admin lê a agenda, mas não cria agendamento (matriz: "Agendar" é do cliente).
  if privado.eh_admin_do_tenant(v_prof.tenant_id) then
    raise exception 'PAPEL_SEM_PERMISSAO: O administrador da clínica não cria agendamentos.';
  end if;

  if p_servico_ids is null or cardinality(p_servico_ids) = 0 then
    raise exception 'SERVICOS_INVALIDOS: Escolha pelo menos um serviço.';
  end if;
  select count(distinct x) into v_qtd from unnest(p_servico_ids) as x;
  if v_qtd <> cardinality(p_servico_ids) then
    raise exception 'SERVICOS_INVALIDOS: Serviço repetido.';
  end if;

  -- RN13: duração = soma das durações. Serviços ativos, do tenant e oferecidos pelo profissional.
  select count(*), sum(s.duracao_min)
    into v_qtd_validos, v_duracao
  from public.servicos s
  join public.profissional_servicos ps
    on ps.servico_id = s.id and ps.profissional_id = v_prof.id
  where s.id = any (p_servico_ids) and s.ativo and s.tenant_id = v_prof.tenant_id;

  if v_qtd_validos <> v_qtd then
    raise exception 'SERVICOS_INVALIDOS: Algum serviço não é oferecido por este profissional.';
  end if;

  if v_obs is not null and char_length(v_obs) > 1000 then
    raise exception 'OBSERVACAO_LONGA: A observação pode ter até 1000 caracteres.';
  end if;

  v_fim := p_inicio + make_interval(mins => v_duracao);
  perform privado.validar_horario(v_prof.id, p_inicio, v_fim, null);

  insert into public.agendamentos (tenant_id, cliente_id, profissional_id, inicio, fim)
  values (v_prof.tenant_id, v_usuario, v_prof.id, p_inicio, v_fim)
  returning id into v_id;

  insert into public.agendamento_servicos (tenant_id, agendamento_id, servico_id)
  select v_prof.tenant_id, v_id, x from unnest(p_servico_ids) as x;

  if v_obs is not null then
    insert into public.observacoes_agendamento (tenant_id, agendamento_id, texto)
    values (v_prof.tenant_id, v_id, v_obs);
  end if;

  return v_id;
exception
  when exclusion_violation then
    -- Corrida entre dois clientes: a constraint do banco é a garantia final (RN12).
    raise exception 'HORARIO_INDISPONIVEL: Este horário acabou de ser ocupado. Escolha outro.';
end;
$$;

-- concluir_atendimento (RN03, RN04, RN07–RN10, D2–D4, D7) — atômico ----------------------------
create function public.concluir_atendimento(
  p_agendamento_id uuid,
  p_ajuste integer,
  p_forma_pagamento public.forma_pagamento
)
returns public.conclusoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos%rowtype;
  v_prof public.profissionais%rowtype;
  v_bruto integer;
  v_liquido integer;
  v_clinica integer;
  v_conclusao public.conclusoes%rowtype;
begin
  select * into v_ag from public.agendamentos a where a.id = p_agendamento_id for update;
  if not found then
    raise exception 'AGENDAMENTO_NAO_ENCONTRADO: Agendamento não encontrado.';
  end if;

  select * into v_prof from public.profissionais p where p.id = v_ag.profissional_id;

  -- RN03: só o profissional do atendimento, e ativo (F2-19; defesa extra — D25 impede o caso).
  if v_prof.usuario_id is distinct from auth.uid() or not v_prof.ativo then
    if v_ag.cliente_id = auth.uid() or privado.eh_admin_do_tenant(v_ag.tenant_id) then
      raise exception 'PAPEL_SEM_PERMISSAO: Só o profissional do atendimento pode concluí-lo.';
    end if;
    raise exception 'AGENDAMENTO_NAO_ENCONTRADO: Agendamento não encontrado.';
  end if;

  if v_ag.status <> 'AGENDADO' then
    raise exception 'ESTADO_FINAL: Este agendamento já foi encerrado e não pode mais ser alterado.';
  end if;

  if now() < v_ag.inicio then
    raise exception 'ANTES_DO_INICIO: Só é possível registrar a partir do horário de início do atendimento.';
  end if;

  if p_ajuste is null or p_forma_pagamento is null then
    raise exception 'VALOR_INVALIDO: Informe o ajuste e a forma de pagamento.';
  end if;

  -- D4 / RN08: bruto = soma dos preços ATUAIS dos serviços, copiado agora.
  select coalesce(sum(s.preco), 0) into v_bruto
  from public.agendamento_servicos x
  join public.servicos s on s.id = x.servico_id
  where x.agendamento_id = v_ag.id;

  v_liquido := v_bruto + p_ajuste;
  if v_liquido < 0 then
    raise exception 'LIQUIDO_NEGATIVO: O desconto não pode ser maior que o valor bruto.';
  end if;

  -- RN09 + D2: clínica arredondada ao centavo, meio para cima, em aritmética inteira.
  v_clinica := ((v_liquido::bigint * v_prof.percentual_repasse + 5000) / 10000)::integer;

  -- RN10: a % usada fica gravada.
  insert into public.conclusoes (
    tenant_id, agendamento_id, valor_bruto, ajuste, valor_liquido, forma_pagamento,
    percentual_repasse, valor_clinica, valor_profissional
  ) values (
    v_ag.tenant_id, v_ag.id, v_bruto, p_ajuste, v_liquido, p_forma_pagamento,
    v_prof.percentual_repasse, v_clinica, v_liquido - v_clinica
  )
  returning * into v_conclusao;

  update public.agendamentos set status = 'CONCLUIDO' where id = v_ag.id;

  return v_conclusao;
end;
$$;

-- Papel de quem chama em relação ao agendamento (uso interno) ----------------------------------
create function privado.papel_no_agendamento(p_ag public.agendamentos)
returns text
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if privado.eh_profissional(p_ag.profissional_id) then return 'profissional'; end if;
  if p_ag.cliente_id = auth.uid() then return 'cliente'; end if;
  if privado.eh_admin_do_tenant(p_ag.tenant_id) then return 'admin'; end if;
  return null;
end;
$$;
revoke all on function privado.papel_no_agendamento(public.agendamentos) from public;

-- cancelar_agendamento (RF23, D26): cliente e profissional, a QUALQUER momento -----------------
-- O admin lê a agenda mas não cancela. Cancelar depois do início também vale (D7 não se aplica).
create function public.cancelar_agendamento(p_agendamento_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos%rowtype;
  v_papel text;
  v_prazo integer;
begin
  select * into v_ag from public.agendamentos a where a.id = p_agendamento_id for update;
  v_papel := case when found then privado.papel_no_agendamento(v_ag) end;
  if v_papel is null then
    raise exception 'AGENDAMENTO_NAO_ENCONTRADO: Agendamento não encontrado.';
  end if;
  if v_papel = 'admin' then
    raise exception 'PAPEL_SEM_PERMISSAO: Só o cliente ou o profissional do atendimento pode cancelar.';
  end if;

  if v_ag.status <> 'AGENDADO' then
    raise exception 'ESTADO_FINAL: Este agendamento já foi encerrado e não pode mais ser alterado.';
  end if;

  -- RN16 / D13 / D26: prazo só para o cliente. 0 (padrão) = sem prazo: cancela a qualquer momento.
  if v_papel = 'cliente' then
    select t.prazo_cancelamento_min into v_prazo from public.tenants t where t.id = v_ag.tenant_id;
    if v_prazo > 0 and now() > v_ag.inicio - make_interval(mins => v_prazo) then
      raise exception 'PRAZO_CANCELAMENTO: O prazo para cancelar ou remarcar pelo app já passou. Fale com a clínica.';
    end if;
  end if;

  update public.agendamentos set status = 'CANCELADO' where id = v_ag.id;
end;
$$;

-- marcar_nao_compareceu (RF25; D7) ---------------------------------------------------------------
create function public.marcar_nao_compareceu(p_agendamento_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos%rowtype;
  v_papel text;
begin
  select * into v_ag from public.agendamentos a where a.id = p_agendamento_id for update;
  v_papel := case when found then privado.papel_no_agendamento(v_ag) end;
  if v_papel is null then
    raise exception 'AGENDAMENTO_NAO_ENCONTRADO: Agendamento não encontrado.';
  end if;
  if v_papel <> 'profissional' then
    raise exception 'PAPEL_SEM_PERMISSAO: Só o profissional do atendimento pode marcar a falta.';
  end if;

  if v_ag.status <> 'AGENDADO' then
    raise exception 'ESTADO_FINAL: Este agendamento já foi encerrado e não pode mais ser alterado.';
  end if;

  if now() < v_ag.inicio then
    raise exception 'ANTES_DO_INICIO: Só é possível registrar a partir do horário de início do atendimento.';
  end if;

  update public.agendamentos set status = 'NAO_COMPARECEU' where id = v_ag.id;
end;
$$;

-- remarcar_agendamento (RF23, D26): cliente e profissional, a QUALQUER momento -----------------
-- O novo horário precisa ser futuro e válido (D5, D6, RN12). D14: muda só data e hora.
create function public.remarcar_agendamento(p_agendamento_id uuid, p_novo_inicio timestamptz)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos%rowtype;
  v_papel text;
  v_prazo integer;
  v_novo_fim timestamptz;
begin
  select * into v_ag from public.agendamentos a where a.id = p_agendamento_id for update;
  v_papel := case when found then privado.papel_no_agendamento(v_ag) end;
  if v_papel is null then
    raise exception 'AGENDAMENTO_NAO_ENCONTRADO: Agendamento não encontrado.';
  end if;
  if v_papel = 'admin' then
    raise exception 'PAPEL_SEM_PERMISSAO: Só o cliente ou o profissional do atendimento pode remarcar.';
  end if;

  if v_ag.status <> 'AGENDADO' then
    raise exception 'ESTADO_FINAL: Este agendamento já foi encerrado e não pode mais ser alterado.';
  end if;

  if v_papel = 'cliente' then
    select t.prazo_cancelamento_min into v_prazo from public.tenants t where t.id = v_ag.tenant_id;
    if v_prazo > 0 and now() > v_ag.inicio - make_interval(mins => v_prazo) then
      raise exception 'PRAZO_CANCELAMENTO: O prazo para cancelar ou remarcar pelo app já passou. Fale com a clínica.';
    end if;
  end if;

  if p_novo_inicio is null then
    raise exception 'HORARIO_PASSADO: Escolha um horário no futuro.';
  end if;

  -- D14: mesmo profissional, mesmos serviços, mesma duração.
  v_novo_fim := p_novo_inicio + (v_ag.fim - v_ag.inicio);
  perform privado.validar_horario(v_ag.profissional_id, p_novo_inicio, v_novo_fim, v_ag.id);

  update public.agendamentos
     set inicio = p_novo_inicio, fim = v_novo_fim
   where id = v_ag.id;
exception
  when exclusion_violation then
    raise exception 'HORARIO_INDISPONIVEL: Este horário acabou de ser ocupado. Escolha outro.';
end;
$$;

-- intervalos_ocupados (F2-05): só início/fim, sem cliente nem motivo ---------------------------
create function public.intervalos_ocupados(
  p_profissional_id uuid,
  p_de timestamptz,
  p_ate timestamptz
)
returns table (inicio timestamptz, fim timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_de is null or p_ate is null or p_ate <= p_de or p_ate - p_de > interval '31 days' then
    raise exception 'PERIODO_INVALIDO: Período de consulta inválido (máximo de 31 dias).';
  end if;

  if not exists (
    select 1 from public.profissionais p
    where p.id = p_profissional_id and p.ativo and privado.tenant_ativo(p.tenant_id)
  ) then
    return;
  end if;

  return query
    select a.inicio, a.fim from public.agendamentos a
    where a.profissional_id = p_profissional_id
      and a.status <> 'CANCELADO'
      and a.inicio < p_ate and a.fim > p_de
    union all
    select b.inicio, b.fim from public.bloqueios b
    where b.profissional_id = p_profissional_id
      and b.inicio < p_ate and b.fim > p_de
    order by 1;
end;
$$;

-- Privilégios das RPCs (F2-06) -----------------------------------------------------------------
revoke all on function public.criar_agendamento(uuid, uuid[], timestamptz, text) from public, anon;
revoke all on function public.concluir_atendimento(uuid, integer, public.forma_pagamento) from public, anon;
revoke all on function public.cancelar_agendamento(uuid) from public, anon;
revoke all on function public.marcar_nao_compareceu(uuid) from public, anon;
revoke all on function public.remarcar_agendamento(uuid, timestamptz) from public, anon;
grant execute on function public.criar_agendamento(uuid, uuid[], timestamptz, text) to authenticated;
grant execute on function public.concluir_atendimento(uuid, integer, public.forma_pagamento) to authenticated;
grant execute on function public.cancelar_agendamento(uuid) to authenticated;
grant execute on function public.marcar_nao_compareceu(uuid) to authenticated;
grant execute on function public.remarcar_agendamento(uuid, timestamptz) to authenticated;
grant execute on function public.intervalos_ocupados(uuid, timestamptz, timestamptz) to anon, authenticated;
