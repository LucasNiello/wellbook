/**
 * Banco de teste: PGlite (PostgreSQL real no Node) + simulação mínima do Supabase + migrations
 * + usuários do seed + seed.sql + tenant B. Cada chamada de `comoX` roda numa transação que é
 * SEMPRE desfeita no fim, então os testes não interferem entre si.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaSupabase = join(aqui, '..', '..');

function ler(caminho: string): string {
  return readFileSync(caminho, 'utf8');
}

/** Ids fixos usados nos testes (iguais aos de fixtures/ e seed.sql). */
export const IDS = {
  usuarios: {
    superAdmin: 'aaaaaaaa-0000-4000-8000-000000000001',
    /** Helena: admin do tenant A e também profissional (esteticista). */
    admin: 'aaaaaaaa-0000-4000-8000-000000000002',
    cabelo: 'aaaaaaaa-0000-4000-8000-000000000003',
    manicure: 'aaaaaaaa-0000-4000-8000-000000000004',
    psicologa: 'aaaaaaaa-0000-4000-8000-000000000005',
    cliente: 'aaaaaaaa-0000-4000-8000-000000000006',
    adminB: 'bbbbbbbb-0000-4000-8000-000000000001',
    profB: 'bbbbbbbb-0000-4000-8000-000000000002',
    clienteB: 'bbbbbbbb-0000-4000-8000-000000000003',
  },
  tenants: {
    a: '11111111-1111-4111-8111-111111111111',
    b: 'bbbbbbbb-1111-4111-8111-111111111111',
  },
  profissionais: {
    admin: '22222222-2222-4222-8222-000000000001',
    cabelo: '22222222-2222-4222-8222-000000000002',
    manicure: '22222222-2222-4222-8222-000000000003',
    psicologa: '22222222-2222-4222-8222-000000000004',
    b: 'bbbbbbbb-2222-4222-8222-000000000001',
  },
  servicos: {
    corte: '33333333-3333-4333-8333-000000000001',
    escova: '33333333-3333-4333-8333-000000000002',
    manicure: '33333333-3333-4333-8333-000000000003',
    pedicure: '33333333-3333-4333-8333-000000000004',
    limpezaPele: '33333333-3333-4333-8333-000000000005',
    psicoterapia: '33333333-3333-4333-8333-000000000006',
    massagemB: 'bbbbbbbb-3333-4333-8333-000000000001',
    reflexologiaB: 'bbbbbbbb-3333-4333-8333-000000000002',
  },
  agendamentos: {
    concluido: '44444444-4444-4444-8444-000000000001',
    cancelado: '44444444-4444-4444-8444-000000000002',
    naoCompareceu: '44444444-4444-4444-8444-000000000003',
    psicoterapia: '44444444-4444-4444-8444-000000000004',
    simultaneoCabelo: '44444444-4444-4444-8444-000000000005',
    simultaneoManicure: '44444444-4444-4444-8444-000000000006',
    b: 'bbbbbbbb-4444-4444-8444-000000000001',
  },
} as const;

export interface Executor {
  /** Consulta com parâmetros posicionais ($1, $2…); devolve as linhas. */
  consultar<T = Record<string, unknown>>(sql: string, parametros?: unknown[]): Promise<T[]>;
  /** Executa um ou mais comandos sem parâmetros. */
  executar(sql: string): Promise<void>;
  /** Troca o usuário logado dentro da mesma transação (null = anon; 'postgres' = superusuário). */
  trocarPara(usuario: string | null | 'postgres'): Promise<void>;
}

export interface Banco {
  db: PGlite;
  /** Roda como usuário logado (papel authenticated, auth.uid() = usuarioId). Sempre desfaz. */
  comoUsuario<T>(usuarioId: string, fn: (tx: Executor) => Promise<T>): Promise<T>;
  /** Roda como visitante sem login (papel anon). Sempre desfaz. */
  comoAnonimo<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  /** Roda como postgres (dono das tabelas, ignora RLS) — para preparar cenários. Sempre desfaz. */
  comoSuperusuario<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  fechar(): Promise<void>;
}

/** Arquivos de migration em ordem. */
export function arquivosMigration(): string[] {
  const pasta = join(pastaSupabase, 'migrations');
  return readdirSync(pasta)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(pasta, f));
}

export async function criarBanco(): Promise<Banco> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(ler(join(aqui, '..', 'simulacao-supabase.sql')));
  for (const arquivo of arquivosMigration()) {
    try {
      await db.exec(ler(arquivo));
    } catch (erro) {
      throw new Error(`Falha ao aplicar ${arquivo}: ${(erro as Error).message}`, { cause: erro });
    }
  }
  await db.exec(ler(join(aqui, '..', 'fixtures', 'usuarios-seed.sql')));
  await db.exec(ler(join(pastaSupabase, 'seed.sql')));
  await db.exec(ler(join(aqui, '..', 'fixtures', 'tenant-b.sql')));

  const executor: Executor = {
    async consultar<T>(sql: string, parametros?: unknown[]) {
      const r = await db.query<T>(sql, parametros);
      return r.rows;
    },
    async executar(sql: string) {
      await db.exec(sql);
    },
    async trocarPara(usuario) {
      await db.exec('reset role');
      if (usuario === 'postgres') {
        await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
        return;
      }
      if (usuario === null) {
        await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
        await db.exec('set local role anon');
        return;
      }
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [usuario]);
      await db.exec('set local role authenticated');
    },
  };

  async function emTransacao<T>(
    usuario: string | null | 'postgres',
    fn: (tx: Executor) => Promise<T>,
  ): Promise<T> {
    await db.exec('begin');
    try {
      await executor.trocarPara(usuario);
      return await fn(executor);
    } finally {
      await db.exec('rollback');
    }
  }

  return {
    db,
    comoUsuario: (id, fn) => emTransacao(id, fn),
    comoAnonimo: (fn) => emTransacao(null, fn),
    comoSuperusuario: (fn) => emTransacao('postgres', fn),
    fechar: () => db.close(),
  };
}

/** Mensagem de erro do Postgres de uma promessa que deve falhar (ex.: 'HORARIO_INDISPONIVEL: …'). */
export async function erroDe(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as Error).message;
  }
  throw new Error('Era esperado um erro, mas a operação deu certo.');
}

/**
 * Próxima data local (AAAA-MM-DD), a pelo menos `minimoDias` dias de hoje, cujo dia da semana
 * esteja em `dias` (0 = domingo). Útil para cair no expediente do seed (segunda a sábado).
 */
export function proximaData(dias: readonly number[], minimoDias = 1, agora = new Date()): string {
  const local = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  for (let i = minimoDias; i < minimoDias + 14; i++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    if (dias.includes(d.getUTCDay())) {
      return d.toISOString().slice(0, 10);
    }
  }
  throw new Error('Data não encontrada');
}

/** Instante ISO (UTC) de uma data e hora locais (−03:00). Ex.: ('2026-11-16', '10:00'). */
export function instanteLocal(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00-03:00`).toISOString();
}
