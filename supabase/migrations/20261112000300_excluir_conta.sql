-- Wellbook · 20261112000300 · D22: exclusão da conta do cliente (RNF05), decisões do Lucas em 12/11
-- - AGENDADO futuros do cliente são CANCELADOS com o motivo "Conta excluída pelo cliente";
-- - observações escritas pelo cliente são APAGADAS (todas);
-- - dados pessoais em `usuarios` são anonimizados; agendamentos encerrados e `conclusoes` ficam
--   (o faturamento da clínica não muda; o cliente aparece como "Cliente removido");
-- - aparelhos de push do usuário são apagados.
-- A remoção da conta no Auth é feita DEPOIS pela Edge Function `excluir-conta` (Admin API).
--
-- DECISÕES PROVISÓRIAS (registro de 12/11):
-- - Só conta de CLIENTE puro: admin, profissional (ativo ou não) e super admin recebem
--   CONTA_COM_VINCULO (essas contas são geridas pela clínica/plataforma — D17, D20).
-- - AGENDADO que já começou (inicio <= now()) NÃO é cancelado: fica para o profissional
--   concluir ou marcar falta (D7), como em qualquer atendimento.

create function public.excluir_minha_conta()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'NAO_AUTENTICADO: Faça login para excluir sua conta.';
  end if;

  if exists (select 1 from public.usuarios u where u.id = v_usuario and u.super_admin)
     or exists (select 1 from public.membros_tenant m where m.usuario_id = v_usuario)
     or exists (select 1 from public.profissionais p where p.usuario_id = v_usuario) then
    raise exception 'CONTA_COM_VINCULO: Contas de clínica ou de profissional são encerradas pela administração.';
  end if;

  -- 1) AGENDADO futuros: cancelados (o gatilho de transição aceita o motivo junto com CANCELADO).
  update public.agendamentos a
     set status = 'CANCELADO', motivo_cancelamento = 'Conta excluída pelo cliente'
   where a.cliente_id = v_usuario and a.status = 'AGENDADO' and a.inicio > now();

  -- 2) Observações escritas pelo cliente: apagadas.
  delete from public.observacoes_agendamento o
   using public.agendamentos a
   where o.agendamento_id = a.id and a.cliente_id = v_usuario;

  -- 3) Aparelhos de push.
  delete from public.dispositivos_push d where d.usuario_id = v_usuario;

  -- 4) Dados pessoais anonimizados (o e-mail precisa continuar único e não identificável).
  update public.usuarios u
     set nome = 'Cliente removido',
         email = 'removido-' || u.id::text || '@anonimo.invalid',
         telefone = null,
         consentimento_lgpd_em = null
   where u.id = v_usuario;
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
