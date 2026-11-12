/**
 * Schemas Zod das ENTRADAS (formulários e parâmetros de RPC).
 * Espelham as constraints do banco: o banco continua sendo a garantia final.
 */
import { z } from 'zod';
import {
  FORMAS_PAGAMENTO,
  IDS_TEMA,
  PLATAFORMAS_PUSH,
} from '../tipos/enums';
import { PONTOS_BASE_TOTAL } from '../regras/valores';
import { horaParaMinutos } from '../regras/fuso';

const uuid = z.uuid({ message: 'Identificador inválido.' });
const centavos = z.number().int({ message: 'Valor em centavos precisa ser inteiro.' });
const hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$|^24:00(:00)?$/, { message: 'Hora inválida.' });
const instante = z.iso.datetime({ offset: true, message: 'Data e hora inválidas.' });

/** Slug da página pública (RF08): minúsculas, números e hífens. */
export const esquemaSlug = z
  .string()
  .min(3, { message: 'Use pelo menos 3 caracteres.' })
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Use só letras minúsculas, números e hífens.',
  });

export const esquemaTenant = z.object({
  nome: z.string().trim().min(2).max(120),
  slug: esquemaSlug,
  tema: z.enum(IDS_TEMA),
  whatsapp: z
    .string()
    .regex(/^\d{10,15}$/, { message: 'WhatsApp com DDI e DDD, só números.' })
    .nullable(),
  endereco: z.string().trim().max(300).nullable(),
  prazo_cancelamento_min: z.number().int().min(0).max(60 * 24 * 30),
});
export type EntradaTenant = z.infer<typeof esquemaTenant>;

export const esquemaProfissional = z.object({
  especialidade: z.string().trim().min(2).max(80),
  percentual_repasse: z.number().int().min(0).max(PONTOS_BASE_TOTAL),
  ativo: z.boolean(),
});
export type EntradaProfissional = z.infer<typeof esquemaProfissional>;

export const esquemaServico = z.object({
  nome: z.string().trim().min(2).max(120),
  duracao_min: z.number().int().min(5).max(720),
  preco: centavos.min(0),
  ativo: z.boolean(),
});
export type EntradaServico = z.infer<typeof esquemaServico>;

export const esquemaHorarioAtendimento = z
  .object({
    profissional_id: uuid,
    dia_semana: z.number().int().min(0).max(6),
    hora_inicio: hora,
    hora_fim: hora,
  })
  .refine((h) => horaParaMinutos(h.hora_fim) > horaParaMinutos(h.hora_inicio), {
    message: 'O fim precisa ser depois do início.',
    path: ['hora_fim'],
  });
export type EntradaHorarioAtendimento = z.infer<typeof esquemaHorarioAtendimento>;

export const esquemaBloqueio = z
  .object({
    profissional_id: uuid,
    inicio: instante,
    fim: instante,
    motivo: z.string().trim().max(200).nullable(),
  })
  .refine((b) => Date.parse(b.fim) > Date.parse(b.inicio), {
    message: 'O fim precisa ser depois do início.',
    path: ['fim'],
  });
export type EntradaBloqueio = z.infer<typeof esquemaBloqueio>;

/** Parâmetros da RPC `criar_agendamento`. */
export const esquemaNovoAgendamento = z.object({
  profissional_id: uuid,
  servico_ids: z.array(uuid).min(1, { message: 'Escolha pelo menos um serviço.' }),
  inicio: instante,
  observacao: z.string().trim().max(1000).nullable(),
});
export type EntradaNovoAgendamento = z.infer<typeof esquemaNovoAgendamento>;

/** Parâmetros da RPC `remarcar_agendamento` (D14: muda só data e hora). */
export const esquemaRemarcacao = z.object({
  agendamento_id: uuid,
  novo_inicio: instante,
});
export type EntradaRemarcacao = z.infer<typeof esquemaRemarcacao>;

/** Parâmetros da RPC `concluir_atendimento` (RF27; D3, D4: bruto não é editável). */
export const esquemaConclusao = z.object({
  agendamento_id: uuid,
  ajuste: centavos,
  forma_pagamento: z.enum(FORMAS_PAGAMENTO),
});
export type EntradaConclusao = z.infer<typeof esquemaConclusao>;

export const esquemaDispositivoPush = z.object({
  token: z.string().min(1).max(500),
  plataforma: z.enum(PLATAFORMAS_PUSH),
});
export type EntradaDispositivoPush = z.infer<typeof esquemaDispositivoPush>;
