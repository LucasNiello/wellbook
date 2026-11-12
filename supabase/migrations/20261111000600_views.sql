-- Wellbook · 0600 · views (F2-04)
-- As duas views rodam com os direitos do dono (security_invoker = false) e filtram por conta
-- própria. security_barrier impede que filtros do usuário vazem linhas antes do WHERE da view.

-- Vitrine pública: só o que o cliente precisa ver do profissional (RF18, RF19, D11).
create view public.profissionais_publicos
with (security_invoker = false, security_barrier = true)
as
select p.id, p.tenant_id, u.nome, p.especialidade, p.avatar_url, p.ativo
from public.profissionais p
join public.usuarios u on u.id = p.usuario_id
join public.tenants t on t.id = p.tenant_id
where t.ativo;

revoke all on public.profissionais_publicos from public, anon, authenticated;
grant select on public.profissionais_publicos to anon, authenticated;

-- Agenda do admin (D16, D26, D27): todos os agendamentos do tenant com NOME e TELEFONE do cliente
-- (finalidade: organização e acolhimento na recepção), SEM e-mail e SEM observação (RN11).
-- Serve só para LEITURA: o admin não cria, cancela nem remarca (D26).
create view public.agendamentos_admin
with (security_invoker = false, security_barrier = true)
as
select
  a.id,
  a.tenant_id,
  a.profissional_id,
  a.cliente_id,
  u.nome as cliente_nome,
  u.telefone as cliente_telefone,
  a.inicio,
  a.fim,
  a.status,
  a.motivo_cancelamento,
  a.criado_em
from public.agendamentos a
join public.usuarios u on u.id = a.cliente_id
where privado.eh_admin_do_tenant(a.tenant_id);

revoke all on public.agendamentos_admin from public, anon, authenticated;
grant select on public.agendamentos_admin to authenticated;
