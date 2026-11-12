-- Wellbook · 0700 · Storage: buckets de logo e avatar com RLS por tenant (RF10, D11, F2-10)
-- Caminho dos arquivos: <tenant_id>/<nome-do-arquivo>. Ex.: 7c1d…/logo.png
-- Buckets públicos para LEITURA (logo e avatar aparecem na página pública).
-- Escrever, trocar, apagar e listar: só o admin do tenant da pasta.
-- No Supabase, storage.objects já vem com RLS ligada; esta migration só cria buckets e políticas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('avatares', 'avatares', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy wellbook_imagens_admin_lista on storage.objects
  for select to authenticated
  using (
    bucket_id in ('logos', 'avatares')
    and privado.eh_admin_do_tenant(privado.uuid_ou_nulo((storage.foldername(name))[1]))
  );

create policy wellbook_imagens_admin_insere on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('logos', 'avatares')
    and privado.eh_admin_do_tenant(privado.uuid_ou_nulo((storage.foldername(name))[1]))
  );

create policy wellbook_imagens_admin_atualiza on storage.objects
  for update to authenticated
  using (
    bucket_id in ('logos', 'avatares')
    and privado.eh_admin_do_tenant(privado.uuid_ou_nulo((storage.foldername(name))[1]))
  )
  with check (
    bucket_id in ('logos', 'avatares')
    and privado.eh_admin_do_tenant(privado.uuid_ou_nulo((storage.foldername(name))[1]))
  );

create policy wellbook_imagens_admin_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('logos', 'avatares')
    and privado.eh_admin_do_tenant(privado.uuid_ou_nulo((storage.foldername(name))[1]))
  );
