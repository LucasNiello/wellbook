-- Wellbook · 20261112000200 · RNF05 no banco (DP2, aprovada pelo Lucas em 12/11)
-- O consentimento LGPD passa a ser gravado pelo gatilho que cria a linha em `usuarios`, com o
-- relógio do SERVIDOR, a partir do metadado `consentimento_lgpd` enviado no signUp. A coluna fica
-- protegida: o próprio usuário não altera nem apaga a data pela API.

create or replace function privado.ao_criar_usuario_auth()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nome, email, telefone, consentimento_lgpd_em)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'telefone'), ''),
    -- Só o valor booleano true conta como aceite (não aceita "sim", 1 etc.).
    case when (new.raw_user_meta_data -> 'consentimento_lgpd') = 'true'::jsonb then now() end
  );
  return new;
end;
$$;

create or replace function privado.proteger_colunas_usuario()
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
    -- RNF05 (DP2): a data do consentimento é gravada só pelo gatilho do cadastro.
    if new.consentimento_lgpd_em is distinct from old.consentimento_lgpd_em then
      raise exception 'CAMPO_PROTEGIDO: Este dado não pode ser alterado por aqui.';
    end if;
  end if;
  return new;
end;
$$;
