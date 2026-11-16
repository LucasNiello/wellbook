/**
 * Traduz erros do PostgREST/Postgres e das RPCs do Wellbook para português (achado A1 da Etapa A).
 * Usado no web e no mobile, para que nenhuma mensagem crua do banco (em inglês) chegue à tela.
 *
 * - Erros das RPCs e gatilhos do Wellbook vêm como "CODIGO: mensagem em português"
 *   (ex.: "JA_ADMIN_DE_EMPRESA: Esta conta já administra uma empresa."): mostramos a mensagem.
 * - Erros de constraint chegam pelo `code` do Postgres: 23503 (FK, D17), 23505, 23514.
 */

export interface ErroBanco {
  readonly code?: string | null;
  readonly message?: string | null;
}

const PREFIXO_WELLBOOK = /^([A-Z][A-Z0-9_]+):\s*(.+)$/s;

const POR_CODIGO_POSTGRES: Readonly<Record<string, string>> = {
  '23503': 'Este registro tem histórico e não pode ser excluído. Desative-o.',
  '23505': 'Já existe um registro com esses dados.',
  '23514': 'Algum dado está fora do formato permitido. Confira os campos.',
  '23502': 'Preencha todos os campos obrigatórios.',
  '22P02': 'Algum dado está em formato inválido.',
  '42501': 'Você não tem permissão para esta ação.',
  PGRST116: 'Registro não encontrado ou sem permissão.',
};

/** Código estável do erro do Wellbook ("JA_ADMIN_DE_EMPRESA"), ou null. */
export function codigoErroWellbook(erro: ErroBanco | null | undefined): string | null {
  const m = PREFIXO_WELLBOOK.exec((erro?.message ?? '').trim());
  return m ? (m[1] ?? null) : null;
}

export function traduzirErroBanco(erro: ErroBanco | null | undefined): string {
  if (!erro) return 'Não foi possível concluir. Tente de novo.';
  const mensagem = (erro.message ?? '').trim();
  const doWellbook = PREFIXO_WELLBOOK.exec(mensagem);
  if (doWellbook?.[2]) return doWellbook[2].trim();
  const porCodigo = erro.code ? POR_CODIGO_POSTGRES[erro.code] : undefined;
  if (porCodigo) return porCodigo;
  const m = mensagem.toLowerCase();
  if (m.includes('foreign key')) return POR_CODIGO_POSTGRES['23503'] as string;
  if (m.includes('duplicate key')) return POR_CODIGO_POSTGRES['23505'] as string;
  if (m.includes('check constraint')) return POR_CODIGO_POSTGRES['23514'] as string;
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return POR_CODIGO_POSTGRES['42501'] as string;
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão. Verifique a internet.';
  }
  return 'Não foi possível concluir. Tente de novo.';
}
