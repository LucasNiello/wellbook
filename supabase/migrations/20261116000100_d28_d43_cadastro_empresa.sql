-- Wellbook · 20261116000100 · Etapa B: decisões D28–D43 (aprovadas pelo Lucas em 16/11/2026)
-- - D29: a empresa se cadastra sozinha (RPC cadastrar_empresa) e nasce ativa; o Super Admin não
--   cria tenant (sai tenants_super_insere) e só ativa/desativa (gatilho proteger_colunas_tenant).
-- - D30: modo "atendo sozinho" cria também a linha em profissionais (D41: repasse 0).
-- - D37: uma empresa por conta; D43: um único admin por clínica, o Super Admin não cria nem
--   remove admins (saem membros_super_insere e membros_super_remove).
-- - D40: slug validado e com colisão resolvida no servidor (-2, -3…); imutável depois de criado.
-- - D44: slugs reservados (rotas do app) são recusados (SLUG_RESERVADO).
-- - D35/D39: o profissional (ativo ou desativado) lê nome e telefone dos clientes com pelo menos
--   uma conclusão com ele, pela RPC meus_clientes_atendidos() (sem e-mail, sem observações).
--
-- PRÉ-REQUISITO NO REMOTO: nenhum tenant com mais de um admin e nenhum usuário admin de mais de
-- um tenant (os índices únicos abaixo falhariam). O bloco 1 confere e explica antes.

-- 1) Pré-checagem dos índices únicos (D37, D43) --------------------------------------------------
do $$
begin
  if exists (select 1 from public.membros_tenant where papel = 'admin'
             group by tenant_id having count(*) > 1) then
    raise exception 'PRE_REQUISITO: existe clínica com mais de um admin (D43). Remova os vínculos extras em membros_tenant antes de aplicar esta migration.';
  end if;
  if exists (select 1 from public.membros_tenant where papel = 'admin'
             group by usuario_id having count(*) > 1) then
    raise exception 'PRE_REQUISITO: existe usuário admin de mais de uma clínica (D37). Remova os vínculos extras em membros_tenant antes de aplicar esta migration.';
  end if;
end;
$$;

-- D43: cada clínica tem um único admin.
create unique index membros_tenant_um_admin_por_tenant
  on public.membros_tenant (tenant_id) where papel = 'admin';
-- D37: uma empresa por conta.
create unique index membros_tenant_uma_empresa_por_usuario
  on public.membros_tenant (usuario_id) where papel = 'admin';

-- 2) Políticas que saem (D29, D43) ---------------------------------------------------------------
drop policy tenants_super_insere on public.tenants;
drop policy membros_super_insere on public.membros_tenant;
drop policy membros_super_remove on public.membros_tenant;
-- Sem política de INSERT/DELETE, nenhum usuário da API cria tenant nem mexe em membros_tenant:
-- o único caminho é a RPC cadastrar_empresa (security definer).

-- 3) Gatilho do tenant: slug imutável (D40) e Super Admin só ativa/desativa (D29) ----------------
-- O Super Admin é comparado pela linha inteira menos `ativo` (nega por padrão: coluna nova já nasce
-- protegida). ATENÇÃO: se um dia existir coluna mantida por gatilho BEFORE UPDATE (ex.: atualizado_em),
-- ela precisa entrar na exceção junto com 'ativo', senão o Super Admin não consegue desativar.
create or replace function privado.proteger_colunas_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id <> old.id or new.slug <> old.slug or new.criado_em <> old.criado_em then
      raise exception 'CAMPO_PROTEGIDO: O link e a identificação da clínica não podem ser alterados.';
    end if;
    if new.ativo <> old.ativo and not privado.eh_super_admin() then
      raise exception 'CAMPO_PROTEGIDO: Só o Super Admin ativa ou desativa a clínica.';
    end if;
    if privado.eh_super_admin() and not privado.eh_admin_do_tenant(old.id)
       and (to_jsonb(new) - 'ativo') <> (to_jsonb(old) - 'ativo') then
      raise exception 'CAMPO_PROTEGIDO: O Super Admin só ativa ou desativa a clínica; os dados são do admin.';
    end if;
  end if;
  return new;
end;
$$;

-- 4) RPC cadastrar_empresa (D29, D30, D37, D38, D40, D41) --------------------------------------
-- Chamada pelo usuário JÁ logado: logo depois do signUp da porta Empresa (D28) ou pela tela
-- /conta do cliente que já tem conta (D38). O consentimento LGPD já foi exigido no cadastro (D32).
create function public.cadastrar_empresa(
  p_nome text,
  p_slug text,
  p_atendo_sozinho boolean,
  p_especialidade text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_base text := btrim(coalesce(p_slug, ''));  -- estrito: maiúscula é recusada (o formulário já converte)
  v_especialidade text := btrim(coalesce(p_especialidade, ''));
  v_slug text;
  v_sufixo text;
  v_n integer := 1;
  v_tenant uuid;
  v_constraint text;
begin
  if v_usuario is null
     or not exists (select 1 from public.usuarios u where u.id = v_usuario) then
    raise exception 'NAO_AUTENTICADO: Faça login para cadastrar sua empresa.';
  end if;
  if privado.senha_provisoria() then
    raise exception 'TROCA_SENHA_OBRIGATORIA: Troque a senha provisória antes de continuar.';
  end if;
  if privado.eh_super_admin() then
    raise exception 'SUPER_ADMIN_SEM_EMPRESA: A conta da plataforma não cadastra empresa.';
  end if;
  if exists (select 1 from public.membros_tenant m
             where m.usuario_id = v_usuario and m.papel = 'admin') then
    raise exception 'JA_ADMIN_DE_EMPRESA: Esta conta já administra uma empresa.';
  end if;
  if exists (select 1 from public.profissionais p where p.usuario_id = v_usuario) then
    raise exception 'JA_PROFISSIONAL: Esta conta já atende em uma clínica. Use outro e-mail para abrir uma empresa.';
  end if;
  if p_atendo_sozinho is null then
    raise exception 'DADO_INVALIDO: Informe se você atende sozinho ou tem equipe.';
  end if;
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'DADO_INVALIDO: O nome da empresa precisa ter de 2 a 120 caracteres.';
  end if;
  if char_length(v_base) not between 3 and 60 or v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'SLUG_INVALIDO: Use de 3 a 60 letras minúsculas, números e hífens no link.';
  end if;
  -- D44: slugs iguais a rotas do app (mesma lista de SLUGS_RESERVADOS no shared).
  if v_base in ('admin', 'auth', 'cadastro', 'clinicas', 'conta', 'entrar', 'privacidade',
                'profissional', 'recuperar-senha', 'redefinir-senha', 'super-admin',
                'trocar-senha', 'api') then
    raise exception 'SLUG_RESERVADO: Este link é reservado pelo Wellbook. Escolha outro.';
  end if;
  if p_atendo_sozinho and char_length(v_especialidade) not between 2 and 80 then
    raise exception 'ESPECIALIDADE_OBRIGATORIA: Informe sua especialidade (2 a 80 caracteres).';
  end if;

  -- D40: tenta o slug pedido; em colisão, base-2, base-3… (a base é cortada para caber em 60).
  loop
    if v_n = 1 then
      v_slug := v_base;
    else
      v_sufixo := '-' || v_n::text;
      v_slug := rtrim(left(v_base, 60 - char_length(v_sufixo)), '-') || v_sufixo;
    end if;
    begin
      insert into public.tenants (nome, slug, ativo)
      values (v_nome, v_slug, true)                                   -- D29: nasce ativa
      returning id into v_tenant;
      exit;
    exception when unique_violation then
      -- Só a colisão de slug gera nova tentativa; outra violação única não é mascarada.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'tenants_slug_key' then
        raise;
      end if;
      v_n := v_n + 1;
      if v_n > 1000 then
        raise exception 'SLUG_INVALIDO: Não foi possível gerar um link livre. Escolha outro.';
      end if;
    end;
  end loop;

  -- O índice único parcial garante D37/D43 mesmo com chamadas simultâneas (a 2ª chamada da mesma
  -- conta cai aqui e tudo é desfeito, inclusive o tenant).
  begin
    insert into public.membros_tenant (tenant_id, usuario_id, papel)
    values (v_tenant, v_usuario, 'admin');
  exception when unique_violation then
    raise exception 'JA_ADMIN_DE_EMPRESA: Esta conta já administra uma empresa.';
  end;

  if p_atendo_sozinho then
    -- D30 + D41: o autônomo é o profissional da própria empresa; repasse 0 (mesma pessoa).
    insert into public.profissionais (tenant_id, usuario_id, especialidade, percentual_repasse)
    values (v_tenant, v_usuario, v_especialidade, 0);
  end if;

  return jsonb_build_object('tenant_id', v_tenant, 'slug', v_slug);
end;
$$;

revoke all on function public.cadastrar_empresa(text, text, boolean, text) from public, anon;
grant execute on function public.cadastrar_empresa(text, text, boolean, text) to authenticated;

-- 5) RPC meus_clientes_atendidos (D35, D39) ------------------------------------------------------
-- Ativo ou desativado: clientes com pelo menos uma conclusão em que o chamador é o profissional.
-- Só id, nome e telefone. Não amplia a RLS de usuarios (que exporia o e-mail) nem dá acesso a
-- agendamentos, observações ou agenda.
create function public.meus_clientes_atendidos()
returns table (id uuid, nome text, telefone text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.nome, u.telefone
  from public.usuarios u
  where not privado.senha_provisoria()
    and exists (
      select 1
      from public.conclusoes c
      join public.agendamentos a on a.id = c.agendamento_id
      join public.profissionais p on p.id = a.profissional_id
      where a.cliente_id = u.id and p.usuario_id = auth.uid()
    )
  order by u.nome
$$;

revoke all on function public.meus_clientes_atendidos() from public, anon;
grant execute on function public.meus_clientes_atendidos() to authenticated;

-- ROLLBACK (NÃO executar junto com a migration; só se for preciso desfazer):
--   drop function public.meus_clientes_atendidos();
--   drop function public.cadastrar_empresa(text, text, boolean, text);
--   recriar privado.proteger_colunas_tenant como em 20261111000300;
--   recriar tenants_super_insere, membros_super_insere e membros_super_remove como em 20261111000400;
--   drop index public.membros_tenant_uma_empresa_por_usuario, public.membros_tenant_um_admin_por_tenant;
