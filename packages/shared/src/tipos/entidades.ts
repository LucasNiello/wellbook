/**
 * Tipos das linhas das 13 tabelas (snake_case, igual ao banco).
 * Provisórios: serão substituídos pelos tipos gerados com `supabase gen types typescript`
 * quando o projeto Supabase existir (ver documentacao/configuracao-supabase.md, seção 9).
 *
 * Convenções: ids são UUID (string); datas `timestamptz` chegam como string ISO 8601 (UTC);
 * `time` chega como 'HH:MM:SS'; dinheiro em centavos (inteiro); percentual em pontos-base (D1).
 */
import type {
  FormaPagamento,
  IdTema,
  PapelMembro,
  PlataformaPush,
  ProvedorLogin,
  StatusAgendamento,
} from './enums';

export type Uuid = string;
/** Instante em UTC, ISO 8601 (ex.: '2026-11-11T13:00:00+00:00'). */
export type InstanteIso = string;
/** Hora local de parede, 'HH:MM' ou 'HH:MM:SS'. */
export type HoraLocal = string;

export interface Tenant {
  id: Uuid;
  nome: string;
  slug: string;
  logo_url: string | null;
  tema: IdTema;
  ativo: boolean;
  /** D15. Só dígitos, com DDI (ex.: '5511999998888'), para o link wa.me. */
  whatsapp: string | null;
  /** D15. */
  endereco: string | null;
  /** RN16 / D13: prazo mínimo, em minutos, para o CLIENTE cancelar/remarcar. 0 = sem prazo. */
  prazo_cancelamento_min: number;
  criado_em: InstanteIso;
}

export interface Usuario {
  /** Mesmo id do auth.users. */
  id: Uuid;
  nome: string;
  email: string;
  telefone: string | null;
  provedor_login: ProvedorLogin;
  super_admin: boolean;
  /** D20: conta criada com senha provisória precisa trocar no primeiro login. */
  troca_senha_obrigatoria: boolean;
  /** RNF05: momento do consentimento LGPD no cadastro (preenchido na Fase 3). */
  consentimento_lgpd_em: InstanteIso | null;
  criado_em: InstanteIso;
}

export interface MembroTenant {
  usuario_id: Uuid;
  tenant_id: Uuid;
  papel: PapelMembro;
  criado_em: InstanteIso;
}

export interface Profissional {
  id: Uuid;
  tenant_id: Uuid;
  /** RN14 / D10: único — um profissional pertence a um só tenant. */
  usuario_id: Uuid;
  especialidade: string;
  /** D1: pontos-base, 0 a 10000 (3000 = 30,00% para a clínica). */
  percentual_repasse: number;
  /** D11. */
  avatar_url: string | null;
  ativo: boolean;
  criado_em: InstanteIso;
}

export interface Servico {
  id: Uuid;
  tenant_id: Uuid;
  nome: string;
  duracao_min: number;
  /** Centavos. */
  preco: number;
  ativo: boolean;
  criado_em: InstanteIso;
}

export interface ProfissionalServico {
  tenant_id: Uuid;
  profissional_id: Uuid;
  servico_id: Uuid;
}

export interface HorarioAtendimento {
  id: Uuid;
  tenant_id: Uuid;
  profissional_id: Uuid;
  /** 0 = domingo … 6 = sábado (igual ao `extract(dow)` do Postgres e ao `Date#getUTCDay`). */
  dia_semana: number;
  hora_inicio: HoraLocal;
  hora_fim: HoraLocal;
}

export interface Bloqueio {
  id: Uuid;
  tenant_id: Uuid;
  profissional_id: Uuid;
  inicio: InstanteIso;
  fim: InstanteIso;
  motivo: string | null;
}

export interface Agendamento {
  id: Uuid;
  tenant_id: Uuid;
  cliente_id: Uuid;
  profissional_id: Uuid;
  inicio: InstanteIso;
  fim: InstanteIso;
  status: StatusAgendamento;
  /** D26: só preenchido quando o profissional é desativado ('Profissional indisponível'). */
  motivo_cancelamento: string | null;
  criado_em: InstanteIso;
}

export interface AgendamentoServico {
  tenant_id: Uuid;
  agendamento_id: Uuid;
  servico_id: Uuid;
}

export interface ObservacaoAgendamento {
  tenant_id: Uuid;
  agendamento_id: Uuid;
  texto: string;
  criado_em: InstanteIso;
}

export interface Conclusao {
  tenant_id: Uuid;
  agendamento_id: Uuid;
  /** Centavos (RN07, D4). */
  valor_bruto: number;
  /** Centavos, com sinal: negativo = desconto (D3). */
  ajuste: number;
  /** Centavos, nunca negativo (D3). */
  valor_liquido: number;
  forma_pagamento: FormaPagamento;
  /** Pontos-base copiados do profissional no momento da conclusão (RN10). */
  percentual_repasse: number;
  valor_clinica: number;
  valor_profissional: number;
  concluido_em: InstanteIso;
}

export interface DispositivoPush {
  id: Uuid;
  usuario_id: Uuid;
  token: string;
  plataforma: PlataformaPush;
  criado_em: InstanteIso;
}
