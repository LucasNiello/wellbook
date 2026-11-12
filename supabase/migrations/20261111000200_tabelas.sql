-- Wellbook · 0200 · as 13 tabelas, constraints e índices
-- Dinheiro em centavos (integer). Percentual em pontos-base (D1: 3000 = 30,00%).
-- Datas em timestamptz (UTC). Tabelas filhas referenciam (id, tenant_id) do pai para que
-- nenhum registro misture tenants (RN15; ver F2-07).

-- 1. tenants ---------------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  slug text not null unique
    check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url text,
  tema public.tema_clinica not null default 'salvia',
  ativo boolean not null default true,
  whatsapp text check (whatsapp ~ '^[0-9]{10,15}$'),                 -- D15
  endereco text check (char_length(endereco) <= 300),                 -- D15
  -- RN16 / D13: prazo mínimo (minutos) para o CLIENTE cancelar/remarcar. 0 = sem prazo.
  prazo_cancelamento_min integer not null default 0
    check (prazo_cancelamento_min between 0 and 43200),
  criado_em timestamptz not null default now()
);

-- 2. usuarios (1:1 com auth.users) -------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users (id),
  nome text not null check (char_length(nome) between 1 and 120),
  email text not null,
  telefone text check (char_length(telefone) <= 20),
  provedor_login public.provedor_login not null default 'email',
  super_admin boolean not null default false,
  troca_senha_obrigatoria boolean not null default false,              -- D20
  consentimento_lgpd_em timestamptz,                                   -- RNF05 (Fase 3)
  criado_em timestamptz not null default now()
);

-- 3. membros_tenant (só papel admin — D10) ------------------------------------------------------
create table public.membros_tenant (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  papel public.papel_membro not null default 'admin',
  criado_em timestamptz not null default now(),
  primary key (tenant_id, usuario_id, papel)
);
create index membros_tenant_usuario_idx on public.membros_tenant (usuario_id);

-- 4. profissionais ------------------------------------------------------------------------------
create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  usuario_id uuid not null unique references public.usuarios (id),   -- RN14 / D10
  especialidade text not null check (char_length(especialidade) between 2 and 80),
  percentual_repasse integer not null check (percentual_repasse between 0 and 10000), -- D1
  avatar_url text,                                                     -- D11
  ativo boolean not null default true,                                 -- D17
  criado_em timestamptz not null default now(),
  unique (id, tenant_id)
);
create index profissionais_tenant_idx on public.profissionais (tenant_id);

-- 5. servicos -----------------------------------------------------------------------------------
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  nome text not null check (char_length(nome) between 2 and 120),
  duracao_min integer not null check (duracao_min between 5 and 720),
  preco integer not null check (preco >= 0),                           -- centavos
  ativo boolean not null default true,                                 -- D17
  criado_em timestamptz not null default now(),
  unique (id, tenant_id)
);
create index servicos_tenant_idx on public.servicos (tenant_id);

-- 6. profissional_servicos (N:N) ---------------------------------------------------------------
create table public.profissional_servicos (
  tenant_id uuid not null,
  profissional_id uuid not null,
  servico_id uuid not null,
  primary key (profissional_id, servico_id),
  foreign key (profissional_id, tenant_id)
    references public.profissionais (id, tenant_id) on delete cascade,
  foreign key (servico_id, tenant_id)
    references public.servicos (id, tenant_id) on delete cascade
);
create index profissional_servicos_servico_idx on public.profissional_servicos (servico_id);
create index profissional_servicos_tenant_idx on public.profissional_servicos (tenant_id);

-- 7. horarios_atendimento (D6: vários períodos por dia = várias linhas) -------------------------
create table public.horarios_atendimento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profissional_id uuid not null,
  dia_semana smallint not null check (dia_semana between 0 and 6),    -- 0 = domingo
  hora_inicio time not null,                                           -- hora local (−03:00)
  hora_fim time not null,
  check (hora_fim > hora_inicio),
  foreign key (profissional_id, tenant_id)
    references public.profissionais (id, tenant_id) on delete cascade
);
create index horarios_profissional_idx on public.horarios_atendimento (profissional_id, dia_semana);
create index horarios_tenant_idx on public.horarios_atendimento (tenant_id);

-- 8. bloqueios ----------------------------------------------------------------------------------
create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profissional_id uuid not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text check (char_length(motivo) <= 200),
  check (fim > inicio),
  foreign key (profissional_id, tenant_id)
    references public.profissionais (id, tenant_id) on delete cascade
);
create index bloqueios_profissional_idx on public.bloqueios (profissional_id, inicio);
create index bloqueios_tenant_idx on public.bloqueios (tenant_id);

-- 9. agendamentos -------------------------------------------------------------------------------
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  cliente_id uuid not null references public.usuarios (id),
  profissional_id uuid not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status public.status_agendamento not null default 'AGENDADO',
  -- D26: preenchido só pelo gatilho que cancela os pendentes ao desativar o profissional.
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 200),
  criado_em timestamptz not null default now(),
  unique (id, tenant_id),
  check (fim > inicio),
  -- D17: profissional com histórico não pode ser apagado (só desativado).
  foreign key (profissional_id, tenant_id) references public.profissionais (id, tenant_id),
  -- RN12 + D12: um profissional atende um cliente por vez. CANCELADO libera o horário.
  -- Vale por profissional, não por cliente (seção 7.1: agendamentos simultâneos do cliente).
  constraint agendamentos_sem_conflito exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim, '[)') with &&
  ) where (status <> 'CANCELADO')
);
create index agendamentos_tenant_inicio_idx on public.agendamentos (tenant_id, inicio);
create index agendamentos_cliente_inicio_idx on public.agendamentos (cliente_id, inicio);

-- 10. agendamento_servicos ----------------------------------------------------------------------
create table public.agendamento_servicos (
  tenant_id uuid not null,
  agendamento_id uuid not null,
  servico_id uuid not null,
  primary key (agendamento_id, servico_id),
  foreign key (agendamento_id, tenant_id)
    references public.agendamentos (id, tenant_id) on delete cascade,
  -- D17: serviço com histórico não pode ser apagado (só desativado).
  foreign key (servico_id, tenant_id) references public.servicos (id, tenant_id)
);
create index agendamento_servicos_servico_idx on public.agendamento_servicos (servico_id);
create index agendamento_servicos_tenant_idx on public.agendamento_servicos (tenant_id);

-- 11. observacoes_agendamento (RN11: tabela separada, RLS própria, admin sem acesso) ------------
create table public.observacoes_agendamento (
  tenant_id uuid not null,
  agendamento_id uuid primary key,
  texto text not null check (char_length(texto) between 1 and 1000),
  criado_em timestamptz not null default now(),
  foreign key (agendamento_id, tenant_id)
    references public.agendamentos (id, tenant_id) on delete cascade
);
create index observacoes_tenant_idx on public.observacoes_agendamento (tenant_id);

-- 12. conclusoes (base de TODOS os dashboards — RN05, RN07–RN10) --------------------------------
create table public.conclusoes (
  tenant_id uuid not null,
  agendamento_id uuid primary key,
  valor_bruto integer not null check (valor_bruto >= 0),
  ajuste integer not null,                                             -- D3: negativo = desconto
  valor_liquido integer not null check (valor_liquido >= 0),
  forma_pagamento public.forma_pagamento not null,
  percentual_repasse integer not null check (percentual_repasse between 0 and 10000),
  valor_clinica integer not null check (valor_clinica >= 0),
  valor_profissional integer not null check (valor_profissional >= 0),
  concluido_em timestamptz not null default now(),
  check (valor_liquido = valor_bruto + ajuste),
  check (valor_clinica + valor_profissional = valor_liquido),
  foreign key (agendamento_id, tenant_id) references public.agendamentos (id, tenant_id)
);
create index conclusoes_tenant_data_idx on public.conclusoes (tenant_id, concluido_em);

-- 13. dispositivos_push (por usuário; não usada para envio nesta entrega — seção 7.1) ----------
create table public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  token text not null unique check (char_length(token) between 1 and 500),
  plataforma public.plataforma_push not null,
  criado_em timestamptz not null default now()
);
create index dispositivos_push_usuario_idx on public.dispositivos_push (usuario_id);
