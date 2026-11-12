-- Só para os testes: faz o papel do script criar-usuarios-seed.ts (Admin API do Supabase Auth),
-- criando as contas em auth.users com ids fixos. O gatilho cria as linhas em public.usuarios.
-- Como o script, marca raw_app_meta_data.criado_pela_clinica = true (DPc7: dispensa o consentimento).
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'superadmin@example.com', '{"nome": "Sofia Wellbook"}', '{"criado_pela_clinica": true}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'admin@example.com',      '{"nome": "Helena Duarte", "telefone": "11911110000"}', '{"criado_pela_clinica": true}'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'cabelo@example.com',     '{"nome": "Rafael Lima", "telefone": "11922220000"}', '{"criado_pela_clinica": true}'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'manicure@example.com',   '{"nome": "Juliana Prado", "telefone": "11933330000"}', '{"criado_pela_clinica": true}'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'psicologa@example.com',  '{"nome": "Marina Costa", "telefone": "11944440000"}', '{"criado_pela_clinica": true}'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'cliente@example.com',    '{"nome": "Carla Mendes", "telefone": "11955550000"}', '{"criado_pela_clinica": true}');
