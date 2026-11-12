# Configuração do Supabase — Wellbook

> Guia passo a passo para quem nunca configurou um Supabase. Mantido junto com as migrations:
> toda decisão do log (`.claude/decisoes/`) que afeta o banco aparece aqui com o ID (ex.: "ver F2-04").
> **Nenhuma senha, chave ou valor real aparece neste arquivo.** Onde o caminho exato de um menu
> não foi confirmado, está escrito "confirmar no painel".

Estado: escrito na Fase 2 (11/11/2026), com o banco testado só no **PGlite** (PostgreSQL real
rodando no Node). Nada foi aplicado em um Supabase real ainda.

---

## 1. Criar o projeto

1. Acesse <https://supabase.com/dashboard> e entre (pode ser com a conta do GitHub).
2. **New project**.
   - **Organization:** a sua (plano **Free**).
   - **Name:** `wellbook`.
   - **Database Password:** clique em *Generate a password* e **guarde num gerenciador de senhas**
     (Bitwarden, 1Password, ou o do navegador). Ela não vai para nenhum arquivo do projeto e só é
     usada se você conectar no banco por fora (psql, Supabase CLI).
   - **Region:** *South America (São Paulo)*.
3. Espere o projeto terminar de criar (1–2 minutos).
4. Copie a **URL** e as **chaves**: menu **Project Settings → API Keys** (confirmar no painel; em
   versões antigas era *Settings → API*).

| O que | Como aparece no painel | Para onde vai | Pública? |
|---|---|---|---|
| URL do projeto | `https://<ref>.supabase.co` | `.env` (raiz), `apps/web/.env.local`, `apps/mobile/.env` | Pública |
| Chave publicável | `sb_publishable_…` (no modelo antigo: **anon**) | `apps/web/.env.local`, `apps/mobile/.env` | Pública (respeita a RLS) |
| Chave secreta | `sb_secret_…` (no modelo antigo: **service_role**) | **só** `.env` da raiz e secrets das Edge Functions | **SECRETA** — ignora a RLS |

> As chaves novas (`sb_publishable_…` / `sb_secret_…`) substituem `anon` / `service_role`. As
> antigas ainda funcionam; use as novas. Se o painel só mostrar as antigas, use `anon` no lugar da
> publicável e `service_role` no lugar da secreta.

## 2. Extensões

| Extensão | Por quê | Onde ativar |
|---|---|---|
| `btree_gist` | A constraint `agendamentos_sem_conflito` (RN12, um profissional atende um cliente por vez) combina `profissional_id WITH =` com o intervalo de horário `&&`. Sem a extensão, o Postgres não consegue usar `=` de UUID num índice GiST. | A migration `20261111000100` já roda `create extension if not exists btree_gist with schema extensions`. Se der erro de permissão, ative em **Database → Extensions**, procure `btree_gist`, ligue com o schema `extensions`, e rode a migration de novo. |
| `pgcrypto` / `gen_random_uuid()` | Gera os ids. | Já vem no Postgres 13+ do Supabase. Nada a fazer. |

## 3. Autenticação

Menu **Authentication** (os nomes das abas podem variar; confirmar no painel).

1. **Sign In / Providers → Email:** ligado.
2. **Confirm email:** **desligado** durante o desenvolvimento (seção 7.1 do CLAUDE.md). Fica em
   *Authentication → Sign In / Providers → Email → Confirm email* (confirmar no painel).
3. **URL Configuration:**
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** acrescente `http://localhost:3000/**` e `exp://**`
4. **Google** e **Apple:** **desligados** (os botões aparecem no app como "Em desenvolvimento").
5. **SMTP do Resend** (*Authentication → Emails → SMTP Settings*, endereço
   `/dashboard/project/<ref>/auth/smtp`):
   - Ligue **Enable Custom SMTP**.
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** a sua **API key do Resend** (crie em <https://resend.com/api-keys>). Cole só aqui.
   - **Sender email:** `onboarding@resend.dev` (sem domínio verificado, o Resend gratuito só entrega
     para o e-mail da sua conta Resend — ver F2-13).
   - **Sender name:** `Wellbook`.
   - Depois de salvar, o limite padrão é de 30 e-mails/hora (ajustável em *Authentication → Rate
     Limits*).

## 4. Storage

A migration `20261111000700_storage.sql` **cria os buckets e as políticas** (ver F2-10). Não crie
nada à mão. Depois de aplicar, confira em **Storage**:

| Bucket | Público? | Limite | Tipos aceitos | Caminho dos arquivos | Quem escreve |
|---|---|---|---|---|---|
| `logos` | Sim (só leitura) | 2 MB | PNG, JPEG, WebP | `<tenant_id>/<arquivo>` | Só o admin daquele tenant |
| `avatares` | Sim (só leitura) | 2 MB | PNG, JPEG, WebP | `<tenant_id>/<arquivo>` | Só o admin daquele tenant |

"Público" quer dizer que a imagem abre pela URL pública (precisa aparecer na página da clínica).
Enviar, trocar, apagar e listar arquivos continua protegido pelas políticas.

## 5. Aplicar as migrations

Sem Supabase CLI (Plano B da seção 7.1): pelo **SQL Editor** do painel, **um arquivo por vez,
nesta ordem exata**. Abra o arquivo no VS Code, copie TUDO, cole numa aba nova do SQL Editor e
clique em **Run**. Só passe para o próximo quando aparecer *Success*.

| # | Arquivo (`supabase/migrations/`) | O que faz |
|---|---|---|
| 1 | `20261111000100_extensoes_e_enums.sql` | Extensão `btree_gist`, schema `privado` e os enums (status, forma de pagamento, papel, provedor, plataforma, tema). |
| 2 | `20261111000200_tabelas.sql` | As 13 tabelas, checks (centavos, pontos-base, slug, durações), chaves estrangeiras compostas por tenant (F2-07), constraint anti-conflito por profissional e índices. |
| 3 | `20261111000300_funcoes_e_gatilhos.sql` | Funções auxiliares das políticas (`privado.*`), fuso −03:00 (F2-08), gatilho que cria `usuarios` quando uma conta é criada no Auth, gatilhos de colunas protegidas (F2-09, F2-17), da máquina de estados (F2-01), da troca de senha (F2-18) e o que **cancela automaticamente os agendamentos AGENDADO ao desativar um profissional** (F2-24 / D26; substitui a trava da D25). |
| 4 | `20261111000400_rls.sql` | Liga a RLS nas 13 tabelas, cria todas as políticas e revoga privilégios perigosos (TRUNCATE etc., F2-06). |
| 5 | `20261111000500_rpcs.sql` | RPCs `criar_agendamento`, `concluir_atendimento`, `cancelar_agendamento`, `marcar_nao_compareceu`, `remarcar_agendamento` e `intervalos_ocupados` (F2-05, F2-11, F2-12). |
| 6 | `20261111000600_views.sql` | Views `profissionais_publicos` (vitrine) e `agendamentos_admin` (agenda do admin: nome e telefone do cliente em **todos** os agendamentos, sem e-mail e sem observação — D16, D27, F2-04). |
| 7 | `20261111000700_storage.sql` | Buckets `logos` e `avatares` e as políticas de `storage.objects` (F2-10). |

**Se um arquivo der erro no meio:** o SQL Editor roda o arquivo inteiro numa transação; quando dá
erro, nada daquele arquivo fica aplicado. Leia a mensagem, veja a seção 12 (Problemas comuns),
corrija a causa (ex.: ligar a extensão) e rode **o mesmo arquivo** de novo. Não pule para o próximo.
Se a mensagem disser que algo "already exists", aquele arquivo já tinha sido aplicado: passe para o
próximo. **Nunca edite uma migration já aplicada** — peça uma migration nova.

> Com o Supabase CLI (opcional, se o antivírus permitir): `supabase link` e `supabase db push`
> aplicam a pasta inteira. Neste projeto, esses comandos só rodam com autorização (CLAUDE.md §3).

## 6. Seed e usuários

A ordem importa: o `seed.sql` procura as contas pelo e-mail (D18).

1. Preencha o `.env` da **raiz** (seção 8): `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `SEED_SENHA`
   (uma senha de teste sua, com 8+ caracteres).
2. No terminal, na pasta `supabase/`: `pnpm usuarios:seed`
   (roda `scripts/criar-usuarios-seed.ts` pela Admin API; é idempotente).
3. No **SQL Editor**, cole e rode `supabase/seed.sql`.

Logins de teste (todos com a senha de `SEED_SENHA`):

| E-mail | Perfil |
|---|---|
| `superadmin@example.com` | Super Admin |
| `admin@example.com` | Admin da Clínica Serena **e** profissional (esteticista) |
| `cabelo@example.com` | Profissional — cabeleireiro (30% para a clínica) |
| `manicure@example.com` | Profissional — manicure (40%) |
| `psicologa@example.com` | Profissional — psicóloga (25%) |
| `cliente@example.com` | Cliente |

O seed cria: tenant **Clínica Serena** (`/clinica-serena`, tema Sálvia, prazo de cancelamento de
120 min), 6 serviços, expediente de segunda a sábado (09:00–12:00 e 13:00–18:00), 1 bloqueio e
agendamentos em todos os estados, inclusive 2 simultâneos do mesmo cliente com profissionais
diferentes e 1 agendamento com observação (RN11). As datas são relativas ao dia em que você roda o seed.

> Para receber e-mails na demonstração (Fase 8), troque o e-mail do cliente por um seu (F2-13).

## 7. Verificação

1. No SQL Editor, abra `supabase/verificacao/rls_por_perfil.sql` e rode **um bloco por vez**
   (de um cabeçalho `-- N)` até o próximo): o editor mostra só o resultado do último comando.
2. O script só faz `SELECT` de contagens: **não altera dados**. O papel e a identidade simulados
   valem só durante aquela execução.
3. Ao lado de cada consulta há um comentário `-- esperado: N`. Compare. Resumo esperado (seed sem
   alterações):

| Perfil | agendamentos | agendamentos_admin | observações | conclusões | usuarios |
|---|---|---|---|---|---|
| Super Admin | 0 | 0 | 0 | 0 | 2 |
| Admin (Helena) | 6 (toda a agenda do tenant — D26) | 6 (nenhum com cliente NULL — D27) | **0** | 1 | 5 |
| Cabeleireiro | 2 | 0 | 1 | 1 | 2 |
| Cliente | 6 | 0 | 2 | 0 | 1 |
| Visitante (anon) | erro de permissão | erro de permissão | erro | erro | erro |

Qualquer número diferente é um problema de RLS: **pare e me mostre o resultado** antes de seguir.

## 8. Variáveis de ambiente

Os `.env` não vão para o Git (`.gitignore`). O modelo é o `.env.example` da raiz.

| Arquivo | Variável | De onde copiar | Pública ou secreta |
|---|---|---|---|
| `.env` (raiz) | `SUPABASE_URL` | Project Settings → API Keys (URL) | Pública |
| `.env` (raiz) | `SUPABASE_SECRET_KEY` | Project Settings → API Keys → chave secreta | **Secreta** |
| `.env` (raiz) | `SEED_SENHA` | Você escolhe | **Secreta** |
| `apps/web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto | Pública |
| `apps/web/.env.local` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável | Pública |
| `apps/mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto | Pública |
| `apps/mobile/.env` | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável | Pública |
| Secrets das Edge Functions (Fase 8) | `RESEND_API_KEY` | resend.com → API Keys | **Secreta** (no painel: Edge Functions → Secrets, confirmar no painel) |

Os apps web e mobile só são ligados ao Supabase na Fase 3; até lá as variáveis deles ficam vazias.
**A chave secreta nunca vai para `apps/web` com `NEXT_PUBLIC_` nem para `apps/mobile`.**

## 9. Gerar os tipos

Os tipos de `packages/shared/src/tipos/entidades.ts` são provisórios (escritos à mão, F1-04). Depois
das migrations aplicadas:

- **Pelo painel:** *Project Settings → API → Generate types* / *API Docs → TypeScript*
  (confirmar no painel). Copie o conteúdo.
- **Pelo CLI** (se o antivírus permitir; com autorização): `npx supabase gen types typescript --project-id <ref> --schema public > packages/shared/src/tipos/banco.gerado.ts`

Salve em `packages/shared/src/tipos/banco.gerado.ts` e me avise: a troca dos tipos manuais pelos
gerados é feita numa fase de código, com typecheck.

## 10. Diferenças PGlite × Supabase

Os testes (`supabase/testes`, `pnpm --filter @wellbook/banco test`) rodam as migrations num PGlite
com uma **simulação** (`supabase/testes/simulacao-supabase.sql`). O que precisa ser conferido no
Supabase real:

| Item | No PGlite | No Supabase real | Como conferir |
|---|---|---|---|
| Dono das tabelas e funções | `postgres` é **superusuário** | `postgres` não é superusuário, mas é dono das tabelas (o dono ignora a RLS) | As RPCs `SECURITY DEFINER` devem funcionar igual. Teste criar e concluir um agendamento pelo app (Fases 5/6) ou pelo `rls_por_perfil.sql`. |
| `auth.uid()` | Lê `request.jwt.claim.sub` de uma configuração da sessão | Lê o JWT real da requisição | `rls_por_perfil.sql` usa `request.jwt.claims`, igual ao real. |
| `auth.users` | Tabela mínima (id, email, metadados) | Tabela completa do GoTrue | O gatilho `ao_criar_usuario_auth` depende de `raw_user_meta_data`. Confira que, depois do `pnpm usuarios:seed`, `public.usuarios` tem 6 linhas com nome. |
| Gatilho em `auth.users` | Criado sem restrição | Criar gatilho em `auth.users` pelo SQL Editor é o padrão documentado; se der "permission denied", me avise | Rodar a migration 3. |
| Storage | Tabelas `storage.buckets`/`objects` mínimas e `storage.foldername` copiada | Schema completo; `storage.objects` pertence a `supabase_storage_admin` | Rodar a migration 7. Se `create policy` em `storage.objects` der erro de dono, crie as 4 políticas pelo painel (*Storage → Policies*) com as mesmas expressões. Teste o upload na Fase 4. |
| Privilégios padrão | Simulados (`grant all` para anon/authenticated/service_role) | Reais | As revogações da migration 4 (F2-06) valem nos dois. Confira com o bloco anon do `rls_por_perfil.sql`. |
| `btree_gist` | Extensão do PGlite (`@electric-sql/pglite/contrib/btree_gist`) | Extensão nativa no schema `extensions` | Seção 2. |
| Views `security_invoker = false` | Funcionam | Funcionam; o *Security Advisor* do painel avisa "Security Definer View" | Esperado (F2-04). A `agendamentos_admin` existe para mostrar ao admin o **nome e o telefone** do cliente **sem o e-mail**; não a troque por `security_invoker`, senão o admin perde o acesso ao nome. |
| Papéis | `anon`, `authenticated`, `service_role` criados pela simulação | Já existem | Nada a fazer. |
| Fuso | `privado.para_local` usa −03:00 fixo (sem tzdata) | Igual | Nada a fazer (F2-08). |
| Gatilho de troca de senha (D20) | `auth.users.encrypted_password` simulada | Coluna real do GoTrue; a troca de senha pelo app atualiza essa coluna | Na Fase 3: criar conta com `troca_senha_obrigatoria = true`, trocar a senha pelo app e conferir que a flag virou `false` (F2-18). |
| Como o SQL Editor executa | — | Cada execução é uma transação só e mostra só o resultado do último comando | Por isso o `rls_por_perfil.sql` é rodado **um bloco por vez** (seção 7). Confirmar no painel na primeira vez. |

> ⚠️ **Toda migration futura que criar tabela, view ou função no schema `public`** recebe de novo,
> pelos privilégios padrão do Supabase, `ALL` (inclusive `TRUNCATE`) para `anon` e `authenticated`.
> A migration nova precisa repetir as revogações da F2-06 para o objeto novo.
>
> ⚠️ **Nunca** acrescente o schema `privado` em *Project Settings → Data API → Exposed schemas*
> (confirmar no painel). Ele guarda as funções auxiliares das políticas e não deve ser chamado pela API.
>
> **Profissionais (F2-17):** pela API o admin só cadastra a si mesmo como profissional ("eu também
> atendo"). Os outros profissionais são criados pela Edge Function da D20 (Fase 4), que usa a chave
> secreta para criar a conta e a linha em `profissionais` juntas.

## 11. Checklist final

- [ ] Projeto criado no plano Free, região São Paulo; senha do banco no gerenciador de senhas
- [ ] URL, chave publicável e chave secreta copiadas (seção 1)
- [ ] `.env` da raiz preenchido (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SEED_SENHA`)
- [ ] Auth: e-mail ligado, confirmação de e-mail desligada, Site URL e Redirect URLs (seção 3)
- [ ] Auth: Google e Apple desligados
- [ ] Auth: SMTP do Resend configurado (seção 3.5)
- [ ] Migration 1 (`…000100_extensoes_e_enums.sql`) aplicada
- [ ] Migration 2 (`…000200_tabelas.sql`) aplicada
- [ ] Migration 3 (`…000300_funcoes_e_gatilhos.sql`) aplicada
- [ ] Migration 4 (`…000400_rls.sql`) aplicada
- [ ] Migration 5 (`…000500_rpcs.sql`) aplicada
- [ ] Migration 6 (`…000600_views.sql`) aplicada
- [ ] Migration 7 (`…000700_storage.sql`) aplicada; buckets `logos` e `avatares` aparecem em Storage
- [ ] `pnpm usuarios:seed` rodado (6 contas criadas)
- [ ] `supabase/seed.sql` rodado no SQL Editor
- [ ] `supabase/verificacao/rls_por_perfil.sql` rodado e os números batem com a seção 7
- [ ] Tipos gerados e salvos (seção 9)
- [ ] `apps/web/.env.local` e `apps/mobile/.env` preenchidos (antes da Fase 3)

## 12. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `type "gist_uuid_ops" does not exist` ou `data type uuid has no default operator class for access method "gist"` | `btree_gist` não está ativa | Seção 2: ative a extensão e rode a migration 2 de novo. |
| `extension "btree_gist" is not available` / permissão ao criar extensão | Projeto sem a extensão liberada para o SQL | Ative pelo painel (Database → Extensions) e rode a migration 1 de novo. |
| `schema "auth" does not exist` | Você está rodando num Postgres que não é Supabase | Use o SQL Editor do projeto Supabase. |
| Seed: "Rode antes o script de usuários" | As contas não existem no Auth | Seção 6, passo 2, antes do `seed.sql`. |
| Seed bloqueado por RLS | O seed foi rodado com uma chave/papel que respeita a RLS | Rode o `seed.sql` no **SQL Editor** (papel `postgres`), não pela API com a chave publicável. Nunca desligue a RLS para isso. |
| `pnpm usuarios:seed`: "Invalid API key" / 401 | Chave errada no `.env` | Use a chave **secreta** (`sb_secret_…` ou `service_role`), não a publicável. Confira se não sobrou espaço ou aspas. |
| App: "Invalid API key" | Chave secreta ou de outro projeto no `.env` do app | O app usa a **publicável** do mesmo projeto da URL. |
| `duplicate key value violates unique constraint "tenants_slug_key"` ao rodar o seed de novo | O seed já foi aplicado | O seed não é para rodar duas vezes. Para recomeçar, peça um script de limpeza (não apague tabelas à mão). |
| `already exists` ao rodar uma migration | Ela já foi aplicada | Passe para a próxima. |
| `policy "…" for table "objects" already exists` | Migration 7 aplicada antes | Passe adiante. |
| E-mail de recuperação não chega | SMTP não configurado, ou destinatário diferente da conta Resend | Seção 3.5; com o Resend gratuito só chega no e-mail da sua conta. |

## 13. Mudanças D26 e D27 (12/11/2026) — o que o Supabase precisa refletir

- **Agenda (D26):** o admin **lê** a agenda de todos e **não** cancela, remarca nem cria agendamento. Cancelar e remarcar são do **cliente** e do **profissional** do atendimento, a qualquer momento. Horários de atendimento e bloqueios são escritos **só pelo profissional** (o admin só lê).
- **Desativar profissional:** o gatilho `cancelar_pendentes_ao_desativar` cancela os AGENDADO dele com `motivo_cancelamento = 'Profissional indisponível'`. Reativar não restaura. O gatilho é `SECURITY DEFINER`: no Supabase real, confira que ele funciona quando o admin desativa pelo app (a RLS não deixa o admin alterar `agendamentos` diretamente).
- **Sigilo (D27):** não há mais `servicos.sigiloso` nem `agendamentos.sigiloso`. O sigilo é a RN11: observações só para o cliente e o profissional do atendimento.
- **Prazo do cliente (RN16):** `tenants.prazo_cancelamento_min` (padrão 0 = sem prazo). Com 0, o cliente cancela a qualquer momento, até depois do início.
- **Avisos ao cliente (Fase 8):** o cancelamento por "Profissional indisponível" será avisado por e-mail, com o WhatsApp da clínica.
