/**
 * Cores de status do agendamento (RNF08, D8): FIXAS, não vêm do tema.
 * Selo = fundo sólido + texto branco. Escolhidas na faixa de luminância 0,157–0,183, que dá:
 * texto branco ≥ 4,5:1 sobre o selo e selo ≥ 3:1 contra o fundo de qualquer um dos 8 temas.
 */
import type { StatusAgendamento } from '../tipos/enums';

export interface CorStatus {
  rotulo: string;
  fundo: string;
  texto: string;
}

export const CORES_STATUS: Readonly<Record<StatusAgendamento, CorStatus>> = {
  AGENDADO: { rotulo: 'Agendado', fundo: '#3173B6', texto: '#FFFFFF' },
  CONCLUIDO: { rotulo: 'Concluído', fundo: '#2F7F47', texto: '#FFFFFF' },
  CANCELADO: { rotulo: 'Cancelado', fundo: '#C74141', texto: '#FFFFFF' },
  NAO_COMPARECEU: { rotulo: 'Não compareceu', fundo: '#76706A', texto: '#FFFFFF' },
};
