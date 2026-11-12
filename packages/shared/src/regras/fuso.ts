/**
 * Fuso horário da aplicação (RNF11): gravação em UTC, exibição em America/Sao_Paulo.
 *
 * Decisão do Lucas: deslocamento FIXO de −03:00 (o Brasil não tem horário de verão desde 2019).
 * Este é o ÚNICO lugar do TypeScript que conhece o fuso. O banco tem a mesma regra isolada em
 * `privado.para_local()` (supabase/migrations). Se um dia o fuso deixar de ser fixo, troque aqui
 * e lá.
 *
 * Não usa Intl nem o fuso do sistema: o resultado é o mesmo no servidor, no navegador e no Hermes.
 */
import { ErroRegraNegocio } from '../erros';

export const FUSO_NOME = 'America/Sao_Paulo';
/** Minutos a somar ao horário local para chegar ao UTC (local 09:00 → 12:00 UTC). */
export const DESLOCAMENTO_UTC_MIN = 180;

const MS_MIN = 60_000;
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Data local no formato 'AAAA-MM-DD'. */
export type DataLocal = string;

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Converte 'HH:MM' ou 'HH:MM:SS' em minutos desde a meia-noite (aceita '24:00'). */
export function horaParaMinutos(hora: string): number {
  const m = RE_HORA.exec(hora);
  if (!m) throw new ErroRegraNegocio('HORA_INVALIDA', `Hora inválida: ${hora}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? '0');
  if (min > 59 || s > 59 || h > 24 || (h === 24 && (min > 0 || s > 0))) {
    throw new ErroRegraNegocio('HORA_INVALIDA', `Hora inválida: ${hora}`);
  }
  return h * 60 + min + s / 60;
}

function validarData(data: DataLocal): { ano: number; mes: number; dia: number } {
  const m = RE_DATA.exec(data);
  if (!m) throw new ErroRegraNegocio('DATA_INVALIDA', `Data inválida: ${data}`);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    teste.getUTCFullYear() !== ano ||
    teste.getUTCMonth() !== mes - 1 ||
    teste.getUTCDate() !== dia
  ) {
    throw new ErroRegraNegocio('DATA_INVALIDA', `Data inválida: ${data}`);
  }
  return { ano, mes, dia };
}

/** Instante UTC correspondente a uma data e hora locais (−03:00). */
export function paraInstante(data: DataLocal, hora: string): Date {
  const { ano, mes, dia } = validarData(data);
  const minutos = horaParaMinutos(hora);
  return new Date(Date.UTC(ano, mes - 1, dia) + (minutos + DESLOCAMENTO_UTC_MIN) * MS_MIN);
}

/** "Relógio de parede" local, representado num Date cujos campos UTC são os campos locais. */
function relogioLocal(instante: Date): Date {
  return new Date(instante.getTime() - DESLOCAMENTO_UTC_MIN * MS_MIN);
}

/** Data local ('AAAA-MM-DD') de um instante. */
export function dataLocal(instante: Date): DataLocal {
  const l = relogioLocal(instante);
  return `${l.getUTCFullYear()}-${doisDigitos(l.getUTCMonth() + 1)}-${doisDigitos(l.getUTCDate())}`;
}

/** Hora local ('HH:MM') de um instante. */
export function horaLocal(instante: Date): string {
  const l = relogioLocal(instante);
  return `${doisDigitos(l.getUTCHours())}:${doisDigitos(l.getUTCMinutes())}`;
}

/** Dia da semana local (0 = domingo … 6 = sábado) de uma data local. */
export function diaDaSemana(data: DataLocal): number {
  const { ano, mes, dia } = validarData(data);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Soma dias a uma data local. */
export function somarDias(data: DataLocal, dias: number): DataLocal {
  const { ano, mes, dia } = validarData(data);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

/** Atalho "Hoje" (RF20). */
export function hoje(agora: Date): DataLocal {
  return dataLocal(agora);
}

/** Atalho "Amanhã" (RF20). */
export function amanha(agora: Date): DataLocal {
  return somarDias(dataLocal(agora), 1);
}

/** Exibição: 'DD/MM/AAAA HH:MM' no horário de Brasília. */
export function formatarDataHora(instante: Date): string {
  const [ano, mes, dia] = dataLocal(instante).split('-');
  return `${dia}/${mes}/${ano} ${horaLocal(instante)}`;
}
