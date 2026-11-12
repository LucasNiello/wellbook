-- Wellbook · 0100 · extensões, schema privado e enums
-- btree_gist: permite a constraint de exclusão "profissional_id WITH =" junto com o intervalo
-- de horário (RN12, anti-conflito por profissional). No Supabase as extensões ficam no schema
-- "extensions" (ver documentacao/configuracao-supabase.md, seção 2).

create extension if not exists btree_gist with schema extensions;

-- Funções auxiliares das políticas e das RPCs ficam fora do schema exposto pela API (public).
create schema if not exists privado;
grant usage on schema privado to anon, authenticated, service_role;

-- Valores iguais aos de packages/shared/src/tipos/enums.ts
create type public.status_agendamento as enum ('AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU');
create type public.forma_pagamento as enum ('pix', 'dinheiro', 'cartao');
-- D10: membros_tenant guarda só o papel admin. Quem atende é definido pela tabela profissionais.
create type public.papel_membro as enum ('admin');
create type public.provedor_login as enum ('email', 'google', 'apple');
create type public.plataforma_push as enum ('android', 'ios', 'web');
create type public.tema_clinica as enum (
  'salvia', 'petroleo', 'terracota', 'lavanda', 'rose', 'grafite', 'onix', 'meia_noite'
);
