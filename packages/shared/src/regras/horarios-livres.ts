/**
 * Horários livres do profissional num dia (RF21, RN12, RN13, D5, D6, D12).
 *
 * - Duração do agendamento = soma das durações dos serviços (RN13).
 * - Grade de 15 em 15 minutos, contada a partir da meia-noite local (D5).
 * - O expediente pode ter vários períodos no mesmo dia (D6); o atendimento cabe inteiro num período.
 * - Não pode sobrepor agendamento que ocupa horário (AGENDADO, CONCLUIDO, NAO_COMPARECEU — D12)
 *   nem bloqueio (RN12). Intervalos semiabertos [inicio, fim): encostar não é conflito.
 * - Só horários futuros (D5: em "Hoje", sem antecedência mínima).
 *
 * A mesma validação existe no banco (RPC `criar_agendamento` + constraint de exclusão).
 */
import { ErroRegraNegocio } from '../erros';
import { diaDaSemana, horaParaMinutos, paraInstante, type DataLocal } from './fuso';

export const PASSO_MINUTOS = 15;

const MS_MIN = 60_000;

export interface PeriodoExpediente {
  /** 0 = domingo … 6 = sábado. */
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

/** RN13: duração total = soma das durações (minutos inteiros e positivos). */
export function calcularDuracaoTotal(duracoesMin: readonly number[]): number {
  if (duracoesMin.length === 0) {
    throw new ErroRegraNegocio('DURACAO_INVALIDA', 'Escolha pelo menos um serviço.');
  }
  let total = 0;
  for (const d of duracoesMin) {
    if (!Number.isSafeInteger(d) || d <= 0) {
      throw new ErroRegraNegocio('DURACAO_INVALIDA', 'Duração de serviço inválida.');
    }
    total += d;
  }
  return total;
}

/** Fim do agendamento = início + duração. */
export function calcularFim(inicio: Date, duracaoMin: number): Date {
  if (!Number.isSafeInteger(duracaoMin) || duracaoMin <= 0) {
    throw new ErroRegraNegocio('DURACAO_INVALIDA', 'Duração inválida.');
  }
  return new Date(inicio.getTime() + duracaoMin * MS_MIN);
}

/** Sobreposição de intervalos semiabertos. */
export function haSobreposicao(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

export interface EntradaHorariosLivres {
  data: DataLocal;
  duracaoMin: number;
  /** Expediente semanal do profissional (todas as linhas; o filtro pelo dia é feito aqui). */
  expediente: readonly PeriodoExpediente[];
  /** Agendamentos que ocupam horário + bloqueios. */
  ocupados: readonly Intervalo[];
  agora: Date;
}

/** Lista os inícios possíveis (instantes UTC), em ordem crescente e sem repetição. */
export function calcularHorariosLivres(entrada: EntradaHorariosLivres): Date[] {
  const { data, duracaoMin, expediente, ocupados, agora } = entrada;
  if (!Number.isSafeInteger(duracaoMin) || duracaoMin <= 0) {
    throw new ErroRegraNegocio('DURACAO_INVALIDA', 'Duração inválida.');
  }
  const dow = diaDaSemana(data);
  const meiaNoite = paraInstante(data, '00:00').getTime();
  const livres = new Set<number>();

  for (const periodo of expediente) {
    if (periodo.dia_semana !== dow) continue;
    const ini = horaParaMinutos(periodo.hora_inicio);
    const fim = horaParaMinutos(periodo.hora_fim);
    if (fim <= ini) continue;

    // Primeiro múltiplo de 15 min a partir do início do período.
    let minuto = Math.ceil(ini / PASSO_MINUTOS) * PASSO_MINUTOS;
    for (; minuto + duracaoMin <= fim; minuto += PASSO_MINUTOS) {
      const candidato: Intervalo = {
        inicio: new Date(meiaNoite + minuto * MS_MIN),
        fim: new Date(meiaNoite + (minuto + duracaoMin) * MS_MIN),
      };
      if (candidato.inicio.getTime() <= agora.getTime()) continue;
      if (ocupados.some((o) => haSobreposicao(candidato, o))) continue;
      livres.add(candidato.inicio.getTime());
    }
  }

  return [...livres].sort((a, b) => a - b).map((ms) => new Date(ms));
}
