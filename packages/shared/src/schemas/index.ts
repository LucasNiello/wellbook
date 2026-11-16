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
import { textoParaCentavos, textoParaPontosBase, type ResultadoConversao } from '../regras/entrada';
import { slugReservado } from '../regras/slug';

const uuid = z.uuid({ message: 'Identificador inválido.' });
const centavos = z.number().int({ message: 'Valor em centavos precisa ser inteiro.' });
/** Maior valor da coluna integer (int4) do Postgres. */
export const LIMITE_INTEIRO_BANCO = 2_147_483_647;
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
  })
  .refine((s) => !slugReservado(s), { message: 'Este link é reservado pelo Wellbook. Escolha outro.' }); // D44

export const esquemaTenant = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { message: 'O nome precisa ter pelo menos 2 caracteres.' })
    .max(120, { message: 'O nome pode ter no máximo 120 caracteres.' }),
  slug: esquemaSlug,
  tema: z.enum(IDS_TEMA),
  whatsapp: z
    .string()
    .regex(/^\d{10,15}$/, { message: 'WhatsApp com DDI e DDD, só números.' })
    .nullable(),
  endereco: z.string().trim().max(300, { message: 'O endereço pode ter no máximo 300 caracteres.' }).nullable(),
  prazo_cancelamento_min: z
    .number({ message: 'Informe o prazo em minutos, só números.' })
    .int({ message: 'Informe o prazo em minutos, só números.' })
    .min(0, { message: 'O prazo vai de 0 a 43200 minutos.' })
    .max(60 * 24 * 30, { message: 'O prazo vai de 0 a 43200 minutos.' }),
});
export type EntradaTenant = z.infer<typeof esquemaTenant>;

export const esquemaProfissional = z.object({
  especialidade: z
    .string()
    .trim()
    .min(2, { message: 'A especialidade precisa ter pelo menos 2 caracteres.' })
    .max(80, { message: 'A especialidade pode ter no máximo 80 caracteres.' }),
  percentual_repasse: z
    .number()
    .int({ message: 'O repasse precisa ser inteiro em pontos-base.' })
    .min(0, { message: 'O repasse vai de 0 a 100%.' })
    .max(PONTOS_BASE_TOTAL, { message: 'O repasse vai de 0 a 100%.' }),
  ativo: z.boolean(),
});
export type EntradaProfissional = z.infer<typeof esquemaProfissional>;

export const esquemaServico = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { message: 'O nome do serviço precisa ter pelo menos 2 caracteres.' })
    .max(120, { message: 'O nome do serviço pode ter no máximo 120 caracteres.' }),
  duracao_min: z
    .number()
    .int({ message: 'Duração em minutos, só números.' })
    .min(5, { message: 'A duração vai de 5 a 720 minutos.' })
    .max(720, { message: 'A duração vai de 5 a 720 minutos.' }),
  preco: centavos
    .min(0, { message: 'O preço não pode ser negativo.' })
    .max(LIMITE_INTEIRO_BANCO, { message: 'Valor alto demais.' }),
  ativo: z.boolean(),
});
export type EntradaServico = z.infer<typeof esquemaServico>;

// Campos de FORMULÁRIO (texto digitado → inteiro), achado A2 da Etapa A ------------------------
function campoConvertido(converter: (texto: string) => ResultadoConversao) {
  return z.string().transform((texto, ctx) => {
    const r = converter(texto);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.mensagem });
      return z.NEVER;
    }
    return r.valor;
  });
}

/** "R$ 1.234,56" → 123456 centavos (recusa mais de 2 casas e negativo). */
export const campoReais = campoConvertido(textoParaCentavos).pipe(
  centavos.min(0).max(LIMITE_INTEIRO_BANCO, { message: 'Valor alto demais.' }),
);
/** "20%" → 2000 pontos-base (0 a 100%, no máximo 2 casas). */
export const campoPercentual = campoConvertido(textoParaPontosBase).pipe(
  z.number().int().min(0).max(PONTOS_BASE_TOTAL),
);

const campoDuracao = z
  .string()
  .trim()
  .regex(/^\d{1,3}$/, { message: 'Duração em minutos, só números.' })
  .transform((t) => Number.parseInt(t, 10));

/** Formulário de serviço do painel → EntradaServico validada (preço em centavos). */
export const esquemaFormularioServico = z
  .object({ nome: z.string(), duracao_min: campoDuracao, preco: campoReais, ativo: z.boolean() })
  .pipe(esquemaServico);

/** Formulário de edição de profissional do painel → EntradaProfissional (repasse em pontos-base). */
export const esquemaFormularioProfissional = z
  .object({ especialidade: z.string(), percentual_repasse: campoPercentual, ativo: z.boolean() })
  .pipe(esquemaProfissional);

/** D41: repasse padrão da clínica no "eu também atendo" do modo equipe e no novo profissional. */
export const REPASSE_PADRAO_PONTOS_BASE = 2000;
/** D41: no modo "atendo sozinho" clínica e profissional são a mesma pessoa. */
export const REPASSE_ATENDO_SOZINHO_PONTOS_BASE = 0;

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
