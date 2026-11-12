-- Wellbook · 20261112000500 · D20 também para o papel ADMIN (DPc1, aprovada pelo Lucas em 12/11)
-- O admin criado pelo Super Admin com senha provisória não age como admin (painel, agenda com
-- nome/telefone de clientes, profissionais, conclusões) até trocar a senha.

create or replace function privado.eh_admin_do_tenant(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros_tenant m
    where m.tenant_id = p_tenant and m.usuario_id = auth.uid() and m.papel = 'admin'
  ) and not privado.senha_provisoria()
$$;

create or replace function privado.eh_profissional_visivel_ao_admin(p_usuario uuid)
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
  ) and not privado.senha_provisoria()
$$;
