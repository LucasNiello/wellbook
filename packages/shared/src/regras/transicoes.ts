/**
 * Máquina de estados do agendamento (CLAUDE.md 5.2) + regras de momento e de prazo.
 *
 *   AGENDADO ──concluir──────────────► CONCLUIDO       (final)
 *   AGENDADO ──cancelar──────────────► CANCELADO       (final; a QUALQUER momento — D26)
 *   AGENDADO ──marcar_nao_compareceu─► NAO_COMPARECEU  (final)
 *   AGENDADO ──remarcar──────────────► AGENDADO        (muda só data/hora — D14; a QUALQUER momento)
 *
 * D26: o admin LÊ a agenda, mas não cancela nem remarca. Desativar o profissional cancela os
 * AGENDADO dele, no banco, com o motivo MOTIVO_CANCELAMENTO_PROFISSIONAL_INDISPONIVEL.
 *
 * A mesma regra é garantida no banco (trigger `validar_transicao_agendamento` e RPCs).
 */
import { ErroRegraNegocio } from '../erros';
import type { StatusAgendamento } from '../tipos/enums';

export const ACOES_AGENDAMENTO = [
  'concluir',
  'cancelar',
  'marcar_nao_compareceu',
  'remarcar',
] as const;
export type AcaoAgendamento = (typeof ACOES_AGENDAMENTO)[number];

/** Quem está executando a ação, em relação ao agendamento. */
export type PapelNaAcao = 'cliente' | 'profissional' | 'admin';

const DESTINO: Record<AcaoAgendamento, StatusAgendamento> = {
  concluir: 'CONCLUIDO',
  cancelar: 'CANCELADO',
  marcar_nao_compareceu: 'NAO_COMPARECEU',
  remarcar: 'AGENDADO',
};

/**
 * Papéis que podem executar cada ação (matriz de permissões, D26).
 * RN03: só o profissional do atendimento conclui. RF25: só ele marca a falta.
 * Cancelar e remarcar: só o cliente e o profissional do atendimento (o admin não — D26).
 */
export const PAPEIS_POR_ACAO: Record<AcaoAgendamento, readonly PapelNaAcao[]> = {
  concluir: ['profissional'],
  marcar_nao_compareceu: ['profissional'],
  cancelar: ['cliente', 'profissional'],
  remarcar: ['cliente', 'profissional'],
};

const ESTADOS_FINAIS: readonly StatusAgendamento[] = ['CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'];

/** D12: estes estados ocupam o horário do profissional; CANCELADO libera. */
export const ESTADOS_QUE_OCUPAM: readonly StatusAgendamento[] = [
  'AGENDADO',
  'CONCLUIDO',
  'NAO_COMPARECEU',
];

export function ehEstadoFinal(status: StatusAgendamento): boolean {
  return ESTADOS_FINAIS.includes(status);
}

export function ocupaHorario(status: StatusAgendamento): boolean {
  return ESTADOS_QUE_OCUPAM.includes(status);
}

/** Estado resultante da ação. Lança erro se a transição não existir. */
export function proximoEstado(status: StatusAgendamento, acao: AcaoAgendamento): StatusAgendamento {
  if (ehEstadoFinal(status)) {
    throw new ErroRegraNegocio(
      'ESTADO_FINAL',
      'Este agendamento já foi encerrado e não pode mais ser alterado.',
    );
  }
  if (status !== 'AGENDADO') {
    throw new ErroRegraNegocio('TRANSICAO_INVALIDA', 'Transição de estado inválida.');
  }
  return DESTINO[acao];
}

/** Transição direta entre estados (usada para validar atualizações). */
export function transicaoValida(de: StatusAgendamento, para: StatusAgendamento): boolean {
  if (de !== 'AGENDADO') return false;
  return para === 'AGENDADO' || ESTADOS_FINAIS.includes(para);
}

const MS_MIN = 60_000;

export interface ContextoAcao {
  acao: AcaoAgendamento;
  status: StatusAgendamento;
  papel: PapelNaAcao;
  /** Início do agendamento. */
  inicio: Date;
  agora: Date;
  /** RN16: prazo mínimo do tenant, em minutos (0 = sem prazo). Vale só para o cliente (D13). */
  prazoCancelamentoMin: number;
}

/**
 * Verifica tudo o que uma ação exige e devolve o novo estado:
 * - transição válida (5.2);
 * - papel permitido (RN03, matriz de permissões);
 * - momento (D7): concluir/não compareceu só a partir do início; cancelar/remarcar a qualquer momento (D26);
 * - prazo do tenant para o cliente (RN16, D13).
 */
export function verificarAcao(ctx: ContextoAcao): StatusAgendamento {
  const novo = proximoEstado(ctx.status, ctx.acao);

  if (!PAPEIS_POR_ACAO[ctx.acao].includes(ctx.papel)) {
    throw new ErroRegraNegocio('PAPEL_SEM_PERMISSAO', 'Você não pode executar esta ação.');
  }

  const inicioMs = ctx.inicio.getTime();
  const agoraMs = ctx.agora.getTime();

  if (ctx.acao === 'concluir' || ctx.acao === 'marcar_nao_compareceu') {
    if (agoraMs < inicioMs) {
      throw new ErroRegraNegocio(
        'ANTES_DO_INICIO',
        'Só é possível registrar a partir do horário de início do atendimento.',
      );
    }
    return novo;
  }

  // cancelar / remarcar (D26): a qualquer momento, inclusive depois do início.
  if (ctx.papel === 'cliente' && !dentroDoPrazo(ctx.inicio, ctx.agora, ctx.prazoCancelamentoMin)) {
    throw new ErroRegraNegocio(
      'PRAZO_CANCELAMENTO',
      'O prazo para cancelar ou remarcar pelo app já passou. Fale com a clínica.',
    );
  }
  return novo;
}

/**
 * RN16 (D26): prazo 0 (padrão) = sem prazo — o cliente cancela/remarca a qualquer momento, até
 * depois do início. Com prazo > 0, só até `prazoMin` minutos antes do início.
 */
export function dentroDoPrazo(inicio: Date, agora: Date, prazoMin: number): boolean {
  if (!Number.isSafeInteger(prazoMin) || prazoMin < 0) {
    throw new ErroRegraNegocio('VALOR_INVALIDO', 'Prazo de cancelamento inválido.');
  }
  if (prazoMin === 0) return true;
  return agora.getTime() <= inicio.getTime() - prazoMin * MS_MIN;
}

/** D26: motivo gravado pelo banco nos agendamentos cancelados quando o profissional é desativado. */
export const MOTIVO_CANCELAMENTO_PROFISSIONAL_INDISPONIVEL = 'Profissional indisponível';
