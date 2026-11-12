-- Wellbook · 20261112000400 · RNF05: consentimento OBRIGATÓRIO no cadastro (DPc7, aprovada pelo Lucas em 12/11)
-- O cadastro de cliente só existe pelo app/site, com aceite explícito. Um signUp direto pela API
-- sem `consentimento_lgpd = true` é recusado. Exceção: contas criadas pela clínica/plataforma pela
-- Admin API, marcadas com raw_app_meta_data.criado_pela_clinica = true (o app_metadata só a
-- Admin API grava; o usuário não consegue pôr essa marca no signUp).
--
-- A checagem roda NO COMMIT (constraint trigger adiado): o GoTrue, no createUser da Admin API,
-- primeiro insere o usuário e só depois grava o app_metadata na mesma transação. Um gatilho
-- AFTER INSERT comum não veria a marca da clínica (revisão DPc7, bloqueador 1).

create function privado.verificar_consentimento_no_commit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_meta jsonb;
  v_app_meta jsonb;
begin
  -- Relê a linha no momento do commit (já com o app_metadata gravado pelo GoTrue).
  select u.raw_user_meta_data, u.raw_app_meta_data into v_user_meta, v_app_meta
  from auth.users u where u.id = new.id;
  if not found then
    return null; -- a conta foi apagada na mesma transação
  end if;
  if coalesce((v_user_meta -> 'consentimento_lgpd') = 'true'::jsonb, false)
     or coalesce((v_app_meta -> 'criado_pela_clinica') = 'true'::jsonb, false) then
    return null;
  end if;
  raise exception 'CONSENTIMENTO_OBRIGATORIO: É preciso aceitar a política de privacidade para criar a conta.';
end;
$$;

create constraint trigger verificar_consentimento
after insert on auth.users
deferrable initially deferred
for each row execute function privado.verificar_consentimento_no_commit();

-- ROLLBACK (NÃO executar junto com a migration; só se for preciso desfazer a DPc7).
-- Volta ao comportamento da 20261112000200: o consentimento é gravado quando vem, mas não é exigido.
--
-- drop trigger if exists verificar_consentimento on auth.users;
-- drop function if exists privado.verificar_consentimento_no_commit();
