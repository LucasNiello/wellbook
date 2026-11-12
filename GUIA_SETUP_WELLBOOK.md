# Guia de instalação e configuração — Wellbook

Este guia prepara **outro PC Windows** para executar o monorepo Wellbook. Execute os comandos PowerShell na **raiz do repositório**, salvo quando a etapa mandar entrar em outra pasta. O projeto contém o app Expo em `apps/mobile`, o site Next.js em `apps/web`, regras compartilhadas em `packages/shared` e migrations em `supabase/migrations`.

> Estado atual: as sete migrations já foram aplicadas ao projeto Supabase WellBook vinculado em 12/11/2026. As telas atuais ainda são o protótipo das fases iniciais; configurar o banco não significa que o app já tenha fluxos de login e agendamento implementados.

## 1. Instalar no Windows

1. Instale **Git** e **Node.js 24.3.0 ou superior**. O mínimo vem de `package.json`; Node 20, embora aceite a Supabase CLI, não atende este projeto.
2. Instale **pnpm 12.18.0**, a versão declarada em `package.json`:

   ```powershell
   npm install -g pnpm@12.18.0
   ```

3. Confira as versões em um terminal novo:

   ```powershell
   git --version
   node --version
   pnpm --version
   ```

Para usar o app no celular, instale **Expo Go** no Android ou iOS. Para abrir no navegador, basta o próprio PC. Este projeto usa o **Supabase hospedado**: Docker não é necessário para o fluxo descrito aqui.

## 2. Baixar e instalar o projeto

```powershell
git clone <URL_DO_REPOSITORIO_WELLBOOK>
cd wellbook
pnpm install --frozen-lockfile
```

Use **pnpm**, não `npm install` na raiz: o repositório usa `workspace:*` e `pnpm-lock.yaml`. Não rode `npx expo start` na raiz; isso procura um `App` que não existe ali. Se houver um `node_modules` antigo criado pelo npm, feche os processos Expo/Node e faça uma instalação limpa com pnpm. Se o Windows/OneDrive retornar `EPERM` ao mover dependências, mantenha o clone fora de uma pasta sincronizada e instale novamente.

## 3. Preparar o projeto Supabase

Se você vai usar o **Supabase WellBook existente**, entre na conta que tem acesso a ele. O Project Ref atual é `kmwijdwmmwurljefgrmh`. Para um Supabase novo, crie o projeto no [Dashboard do Supabase](https://supabase.com/dashboard) e substitua o ref nos comandos abaixo. O ref é o trecho da URL `https://<ref>.supabase.co`.

No Dashboard, copie em **Project Settings → API Keys** a URL, a **chave publicável** (`sb_publishable_...`, ou a `anon` antiga) e, **somente se for usar o seed**, a chave secreta (`sb_secret_...`, ou `service_role` antiga). Guarde a senha do banco em um gerenciador de senhas. Nunca coloque chave secreta em `apps/mobile`, `apps/web` ou em arquivos versionados.

### Variáveis de ambiente

Crie os arquivos indicados; substitua os valores de exemplo pelos do **mesmo projeto** Supabase:

`apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env` na raiz, **apenas para criar as contas de demonstração**:

```dotenv
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SEED_SENHA=<senha_de_teste_com_pelo_menos_8_caracteres>
```

Os três arquivos são ignorados pelo Git. As variáveis `EXPO_PUBLIC_` e `NEXT_PUBLIC_` são públicas no app/navegador; a chave secreta **nunca** deve receber esses prefixos. O guia detalhado do banco está em `documentacao/configuracao-supabase.md`.

### Configurações no Dashboard

- Em **Authentication → Sign In / Providers**, deixe **Email** ligado e **Confirm email** desligado durante o desenvolvimento, conforme a configuração planejada para este protótipo.
- Em **Authentication → URL Configuration**, defina **Site URL** como `http://localhost:3000` e adicione `http://localhost:3000/**` e `exp://**` às URLs de redirecionamento.
- Deixe Google e Apple desligados nesta fase.
- Os buckets `logos` e `avatares`, assim como suas políticas, são criados pela migration `20261111000700_storage.sql`. Não os crie manualmente antes de aplicar as migrations.
- A migration inicial cria a extensão `btree_gist`. Se faltar permissão, habilite-a em **Database → Extensions**, no schema `extensions`, e repita a migration pendente.
- Não exponha o schema `privado` pela Data API.

O SMTP do Resend e as notificações são etapas futuras. A configuração completa planejada está em `documentacao/configuracao-supabase.md`; não são necessárias para abrir as telas atuais.

## 4. Conectar a Supabase CLI e aplicar migrations

A CLI pode ser usada sem instalar um comando `supabase` global. Na raiz:

```powershell
npx supabase --version
npx supabase login
npx supabase link --project-ref kmwijdwmmwurljefgrmh
npx supabase migration list --remote
npx supabase db push --remote --dry-run
```

Se o `npx` pedir para baixar a CLI, confirme. Para **outro projeto Supabase**, troque o ref no `link` e confira o nome do projeto mostrado antes de qualquer envio. No CLI v3, `db push` sem `--remote` usa o banco **local**, por isso o parâmetro é obrigatório aqui.

Se o `dry-run` listar migrations pendentes e o destino estiver correto, aplique-as:

```powershell
npx supabase db push --remote
npx supabase migration list --remote
```

A CLI pedirá confirmação antes de alterar o projeto hospedado. No Supabase WellBook atual, as sete migrations já constam no histórico remoto; o `db push` deve indicar que está atualizado. **Não rode** `db reset` no projeto remoto. Para mudanças futuras, crie uma migration nova em vez de editar uma já aplicada.

Se a CLI não funcionar por bloqueio do antivírus, o plano alternativo é aplicar os sete arquivos `supabase/migrations/*.sql` em ordem no SQL Editor. As instruções e a ordem exata estão em `documentacao/configuracao-supabase.md`.

## 5. Dados de demonstração (opcional)

As migrations criam a estrutura, **não** as contas ou o tenant de demonstração. Só faça esta etapa se quiser a Clínica Serena e as contas de teste, em um banco onde esses dados ainda não existam:

```powershell
cd supabase
pnpm usuarios:seed
cd ..
```

Em seguida, abra `supabase/seed.sql` no **SQL Editor** do Dashboard e execute o conteúdo. O script de usuários lê a chave secreta do `.env` da raiz. `seed.sql` não foi feito para ser executado repetidamente: pode falhar por registros duplicados. Para validar RLS com os dados de demonstração, use `supabase/verificacao/rls_por_perfil.sql` **um bloco por vez**, comparando os números com a seção 7 de `documentacao/configuracao-supabase.md`.

## 6. Iniciar e testar

### App Expo no navegador

```powershell
cd apps/mobile
npx expo start --web -c
```

Abra a URL `http://localhost:8081` que o Expo mostrar. Se a porta estiver ocupada, encerre o processo anterior com `Ctrl+C` ou use `npx expo start --web --port 8082`. Para usar Expo Go, na mesma pasta rode `npx expo start -c` e leia o QR code; celular e PC devem alcançar a mesma rede.

### Site Next.js

Em **outro terminal**, a partir da raiz:

```powershell
pnpm --filter @wellbook/web dev
```

Abra `http://localhost:3000`. Expo e Next.js são apps separados; abrir um não inicia o outro.

### Verificações

Na raiz, depois de uma instalação completa:

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

Para conferir apenas o estado remoto das migrations:

```powershell
npx supabase migration list --remote
```

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `Unable to resolve "../../App" from "expo/AppEntry.js"` | Você iniciou o Expo na raiz. Entre em `apps/mobile` e rode `npx expo start --web -c`. |
| `supabase` não é reconhecido | Use `npx supabase ...` na raiz. A instalação global não é necessária. |
| Aviso `Unknown project config "auto-install-peers"` | É um aviso do npm sobre a `.npmrc` do pnpm; não é o erro do bundle. Use pnpm para instalar dependências. |
| `EPERM` em `node_modules` | Feche Expo/Node, evite misturar npm e pnpm e, se estiver no OneDrive, use um clone fora da pasta sincronizada. |
| `Unable to resolve "zod"` | A instalação do workspace ficou incompleta. Conclua `pnpm install --frozen-lockfile` na raiz e reinicie o Expo com `-c`. |
| `db push` não encontra o projeto hospedado | Confirme `npx supabase login`, `npx supabase link --project-ref <ref>` e use `--remote`. |
| `Invalid API key` | Confira se URL e chave são do mesmo projeto; no app use a chave publicável, não a secreta. |

## Checklist rápido

- [ ] Git, Node 24.3+ e pnpm 12.18.0 instalados.
- [ ] Clone instalado com `pnpm install --frozen-lockfile` na raiz.
- [ ] Arquivos `.env` preenchidos com chaves adequadas, sem versionar segredos.
- [ ] Projeto Supabase correto vinculado e `migration list --remote` conferida.
- [ ] Migrations aplicadas somente se pendentes.
- [ ] Expo iniciado em `apps/mobile`; Next.js iniciado separadamente se necessário.
- [ ] `pnpm typecheck`, `pnpm lint` e `pnpm test` executados após a instalação completa.

Fontes: [instalação da Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [mudanças da CLI v3](https://supabase.com/changelog/supabase-cli-v3), [instalação do pnpm](https://pnpm.io/installation).
