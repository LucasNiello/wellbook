/** Valores dos enums do banco (mesmos nomes e mesma grafia das migrations). */

export const STATUS_AGENDAMENTO = ['AGENDADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'] as const;
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number];

export const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'cartao'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** D10: `membros_tenant` guarda só o papel admin; quem atende é definido por `profissionais`. */
export const PAPEIS_MEMBRO = ['admin'] as const;
export type PapelMembro = (typeof PAPEIS_MEMBRO)[number];

/** Seção 7.1: só `email` é usado nesta entrega; google/apple ficam no modelo. */
export const PROVEDORES_LOGIN = ['email', 'google', 'apple'] as const;
export type ProvedorLogin = (typeof PROVEDORES_LOGIN)[number];

export const PLATAFORMAS_PUSH = ['android', 'ios', 'web'] as const;
export type PlataformaPush = (typeof PLATAFORMAS_PUSH)[number];

export const IDS_TEMA = [
  'salvia',
  'petroleo',
  'terracota',
  'lavanda',
  'rose',
  'grafite',
  'onix',
  'meia_noite',
] as const;
export type IdTema = (typeof IDS_TEMA)[number];
