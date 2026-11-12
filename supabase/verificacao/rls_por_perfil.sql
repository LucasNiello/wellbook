-- =====================================================================================
-- Wellbook - verificação de RLS por perfil (Supabase REAL)
--
-- COMO RODAR
--   1. Painel do Supabase > SQL Editor > New query.
--   2. Cole e execute UM BLOCO POR VEZ (de um cabeçalho "-- N)" até o próximo). O SQL Editor
--      mostra só o resultado do ÚLTIMO comando, e o último comando de cada bloco é o SELECT.
--   3. Cada bloco devolve uma tabela com (objeto, linhas).
--      Compare a coluna "linhas" com o comentário "-- esperado: N" ao lado de cada linha do script.
--
-- SEGURANÇA
--   * Só há SELECT (contagens): nada é gravado nem alterado.
--   * Cada execução do SQL Editor é uma transação só; o papel e a identidade (set local /
--     set_config(..., true)) valem só nela. A função pg_temp.contar é temporária (da sessão).
--
-- PRÉ-REQUISITOS
--   * Seed aplicado SEM o tenant B (1 tenant, 4 profissionais, 6 serviços, 6 usuários do seed).
--     Se existir o tenant B (testes automatizados), os números mudam.
--   * Usuários do seed criados pelo script da Admin API (e-mails abaixo, todos @example.com):
--     superadmin@, admin@ (Helena), cabelo@ (Rafael), manicure@ (Juliana), psicologa@ (Marina), cliente@ (Carla).
--
-- OBSERVAÇÃO TÉCNICA
--   Os claims do JWT são definidos ANTES de "set local role", porque o papel authenticated
--   não pode ler auth.users. A função pg_temp.contar roda como o papel atual (RLS vale) e
--   devolve "ERRO permission denied" quando o papel nem tem privilégio na tabela.
-- =====================================================================================


-- -------------------------------------------------------------------------------------
-- 1) SUPER ADMIN (superadmin@example.com): não vê nada operacional
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'superadmin@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

select 'super: agendamentos' as objeto, pg_temp.contar('public.agendamentos') as linhas              -- esperado: 0
union all select 'super: agendamentos_admin',      pg_temp.contar('public.agendamentos_admin')       -- esperado: 0
union all select 'super: agendamento_servicos',    pg_temp.contar('public.agendamento_servicos')     -- esperado: 0
union all select 'super: conclusoes',              pg_temp.contar('public.conclusoes')               -- esperado: 0
union all select 'super: observacoes_agendamento', pg_temp.contar('public.observacoes_agendamento')  -- esperado: 0
union all select 'super: bloqueios',               pg_temp.contar('public.bloqueios')                -- esperado: 0
union all select 'super: usuarios (ele + admin)',  pg_temp.contar('public.usuarios')                 -- esperado: 2
union all select 'super: tenants',                 pg_temp.contar('public.tenants');                 -- esperado: 1


-- -------------------------------------------------------------------------------------
-- 2) ADMIN (admin@example.com = Helena, admin que também atende)
--    D26/D27: lê TODA a agenda do tenant (6) e vê nome e telefone do cliente pela view;
--    observações: NUNCA (RN11).
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

select 'admin: agendamentos (todos do tenant)' as objeto, pg_temp.contar('public.agendamentos') as linhas      -- esperado: 6
union all select 'admin: agendamentos_admin',                       pg_temp.contar('public.agendamentos_admin')                            -- esperado: 6
union all select 'admin: agendamentos_admin com cliente_nome NULL', pg_temp.contar('public.agendamentos_admin where cliente_nome is null') -- esperado: 0 (D27: sem máscara)
union all select 'admin: agendamento_servicos (todos do tenant)', pg_temp.contar('public.agendamento_servicos')                            -- esperado: 7 (concluído tem 2 itens + 5 agendamentos com 1 item)
union all select 'admin: observacoes_agendamento (RN11)',           pg_temp.contar('public.observacoes_agendamento')                       -- esperado: 0
union all select 'admin: conclusoes',                               pg_temp.contar('public.conclusoes')                                    -- esperado: 1
union all select 'admin: bloqueios',                                pg_temp.contar('public.bloqueios')                                     -- esperado: 1
-- Nota: Helena lê a linha da Carla só porque a atendeu COMO PROFISSIONAL (naoCompareceu). O admin que não atende
-- (ex.: admin do tenant B) NÃO lê usuarios de clientes: nome e telefone vêm só pela view agendamentos_admin (sem e-mail).
union all select 'admin: usuarios (4 do tenant + Carla, que ela atendeu como profissional)',           pg_temp.contar('public.usuarios')                                      -- esperado: 5
union all select 'admin: tenants',                                  pg_temp.contar('public.tenants');                                      -- esperado: 1


-- -------------------------------------------------------------------------------------
-- 3) PROFISSIONAL cabelo (cabelo@example.com = Rafael)
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'cabelo@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

select 'cabelo: agendamentos' as objeto, pg_temp.contar('public.agendamentos') as linhas                -- esperado: 2
union all select 'cabelo: agendamentos_admin',      pg_temp.contar('public.agendamentos_admin')          -- esperado: 0
union all select 'cabelo: observacoes_agendamento', pg_temp.contar('public.observacoes_agendamento')    -- esperado: 1
union all select 'cabelo: conclusoes',              pg_temp.contar('public.conclusoes')                  -- esperado: 1
union all select 'cabelo: bloqueios (so os dele)',  pg_temp.contar('public.bloqueios')                   -- esperado: 0
union all select 'cabelo: usuarios (ele + Carla)',  pg_temp.contar('public.usuarios');                   -- esperado: 2


-- -------------------------------------------------------------------------------------
-- 4) PROFISSIONAL manicure (manicure@example.com = Juliana)
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'manicure@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

select 'manicure: agendamentos' as objeto, pg_temp.contar('public.agendamentos') as linhas                -- esperado: 2
union all select 'manicure: agendamentos_admin',      pg_temp.contar('public.agendamentos_admin')          -- esperado: 0
union all select 'manicure: observacoes_agendamento', pg_temp.contar('public.observacoes_agendamento')    -- esperado: 0
union all select 'manicure: conclusoes',              pg_temp.contar('public.conclusoes')                  -- esperado: 0
union all select 'manicure: usuarios (ela + Carla)',  pg_temp.contar('public.usuarios');                   -- esperado: 2


-- -------------------------------------------------------------------------------------
-- 5) PROFISSIONAL psicóloga (psicologa@example.com = Marina)
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'psicologa@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

select 'psicologa: agendamentos (o dela)' as objeto, pg_temp.contar('public.agendamentos') as linhas  -- esperado: 1
union all select 'psicologa: observacoes_agendamento', pg_temp.contar('public.observacoes_agendamento')     -- esperado: 1
union all select 'psicologa: conclusoes',              pg_temp.contar('public.conclusoes')                   -- esperado: 0
union all select 'psicologa: bloqueios (o dela)',      pg_temp.contar('public.bloqueios')                    -- esperado: 1
union all select 'psicologa: usuarios (ela + Carla)',  pg_temp.contar('public.usuarios');                    -- esperado: 2


-- -------------------------------------------------------------------------------------
-- 6) CLIENTE (cliente@example.com = Carla)
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'cliente@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

select 'cliente: agendamentos' as objeto, pg_temp.contar('public.agendamentos') as linhas                -- esperado: 6
union all select 'cliente: agendamentos_admin',      pg_temp.contar('public.agendamentos_admin')         -- esperado: 0
union all select 'cliente: observacoes_agendamento', pg_temp.contar('public.observacoes_agendamento')   -- esperado: 2
union all select 'cliente: conclusoes',              pg_temp.contar('public.conclusoes')                 -- esperado: 0
union all select 'cliente: usuarios (so ela)',       pg_temp.contar('public.usuarios')                   -- esperado: 1
union all select 'cliente: profissionais_publicos',  pg_temp.contar('public.profissionais_publicos')     -- esperado: 4
union all select 'cliente: tenants',                 pg_temp.contar('public.tenants');                   -- esperado: 1


-- -------------------------------------------------------------------------------------
-- 7) ANÔNIMO (sem login)
-- -------------------------------------------------------------------------------------
create or replace function pg_temp.contar(consulta text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute 'select count(*) from ' || consulta into n;
  return n::text;
exception when insufficient_privilege then return 'ERRO permission denied';
end $f$;
select set_config('request.jwt.claims', '', true);
set local role anon;

select 'anon: tenants (ativos)' as objeto, pg_temp.contar('public.tenants') as linhas                    -- esperado: 1
union all select 'anon: profissionais_publicos',     pg_temp.contar('public.profissionais_publicos')     -- esperado: 4
union all select 'anon: servicos',                   pg_temp.contar('public.servicos')                   -- esperado: 6
union all select 'anon: horarios_atendimento',       pg_temp.contar('public.horarios_atendimento')       -- esperado: 48 (4 profissionais x 6 dias x 2 períodos)
union all select 'anon: usuarios',                   pg_temp.contar('public.usuarios')                   -- esperado: ERRO permission denied
union all select 'anon: agendamentos',               pg_temp.contar('public.agendamentos')               -- esperado: 0 ou ERRO permission denied
union all select 'anon: agendamentos_admin',         pg_temp.contar('public.agendamentos_admin')         -- esperado: 0 ou ERRO permission denied
union all select 'anon: observacoes_agendamento',    pg_temp.contar('public.observacoes_agendamento')    -- esperado: 0 ou ERRO permission denied
union all select 'anon: conclusoes',                 pg_temp.contar('public.conclusoes')                 -- esperado: 0 ou ERRO permission denied
union all select 'anon: bloqueios',                  pg_temp.contar('public.bloqueios');                 -- esperado: 0 ou ERRO permission denied

-- -------------------------------------------------------------------------------------
-- 8) VERIFICAÇÃO EXTRA (rode SOZINHA, numa execução separada, como postgres)
-- -------------------------------------------------------------------------------------
reset role;
-- Deve listar 0 linhas.
-- Tabelas do schema public SEM RLS ligada (qualquer resultado aqui é falha):
select c.relname as tabela_sem_rls                                                                   -- esperado: nenhuma linha
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
