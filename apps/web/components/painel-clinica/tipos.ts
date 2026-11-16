import type { StatusAgendamento } from '@wellbook/shared';

export type Clinica = {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  tema: string;
  whatsapp: string | null;
  endereco: string | null;
  prazo_cancelamento_min: number;
  ativo: boolean;
};
export type Servico = { id: string; nome: string; duracao_min: number; preco: number; ativo: boolean };
export type Profissional = {
  id: string;
  usuario_id: string;
  nome: string;
  especialidade: string;
  percentual_repasse: number;
  avatar_url: string | null;
  ativo: boolean;
};
export type Vinculo = { profissional_id: string; servico_id: string };
export type Horario = { id: string; profissional_id: string; dia_semana: number; hora_inicio: string; hora_fim: string };
export type Bloqueio = { id: string; profissional_id: string; inicio: string; fim: string; motivo: string | null };
export type Agendamento = {
  id: string;
  profissional_id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  servicos: string[];
};
export type DadosPainel = {
  clinica: Clinica;
  servicos: Servico[];
  profissionais: Profissional[];
  vinculos: Vinculo[];
  horarios: Horario[];
  bloqueios: Bloqueio[];
  agendamentos: Agendamento[];
  usuarioId: string;
};
export type Aba = 'visao' | 'clinica' | 'equipe' | 'servicos' | 'agenda';
export type FormClinica = { nome: string; whatsapp: string; endereco: string; prazo: string };
