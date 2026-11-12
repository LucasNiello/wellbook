import { describe, it, expect } from 'vitest';
import {
  esquemaSlug,
  esquemaTenant,
  esquemaProfissional,
  esquemaServico,
  esquemaHorarioAtendimento,
  esquemaBloqueio,
  esquemaNovoAgendamento,
  esquemaRemarcacao,
  esquemaConclusao,
  esquemaDispositivoPush,
} from '../index';

const UUID = '3f0e9c4a-8b1d-4c2e-9f3a-1b2c3d4e5f60';
const UUID2 = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ok = (r: { success: boolean }) => r.success;

describe('esquemaSlug', () => {
  it('aceita slugs válidos', () => {
    for (const s of ['abc', 'clinica-bela', 'studio-2026', 'a1b-c2d-e3f']) {
      expect(ok(esquemaSlug.safeParse(s))).toBe(true);
    }
  });
  it('rejeita menos de 3 e mais de 60 caracteres', () => {
    expect(ok(esquemaSlug.safeParse('ab'))).toBe(false);
    expect(ok(esquemaSlug.safeParse('a'.repeat(60)))).toBe(true);
    expect(ok(esquemaSlug.safeParse('a'.repeat(61)))).toBe(false);
  });
  it('rejeita maiúsculas, espaços, acentos, underline e hífens mal posicionados', () => {
    for (const s of ['Clinica', 'clinica bela', 'clínica', 'cli_nica', '-clinica', 'clinica-', 'cli--nica']) {
      expect(ok(esquemaSlug.safeParse(s))).toBe(false);
    }
  });
});

describe('esquemaTenant', () => {
  const valido = {
    nome: 'Clínica Bela',
    slug: 'clinica-bela',
    tema: 'salvia',
    whatsapp: '11987654321',
    endereco: 'Rua A, 100',
    prazo_cancelamento_min: 0,
  };
  it('aceita tenant válido', () => {
    expect(ok(esquemaTenant.safeParse(valido))).toBe(true);
  });
  it('whatsapp e endereço podem ser null', () => {
    expect(ok(esquemaTenant.safeParse({ ...valido, whatsapp: null, endereco: null }))).toBe(true);
  });
  it('whatsapp: 10 a 15 dígitos', () => {
    expect(ok(esquemaTenant.safeParse({ ...valido, whatsapp: '1198765432' }))).toBe(true);
    expect(ok(esquemaTenant.safeParse({ ...valido, whatsapp: '1'.repeat(15) }))).toBe(true);
    expect(ok(esquemaTenant.safeParse({ ...valido, whatsapp: '119876543' }))).toBe(false);
    expect(ok(esquemaTenant.safeParse({ ...valido, whatsapp: '1'.repeat(16) }))).toBe(false);
  });
  it('whatsapp com símbolos ou letras é rejeitado', () => {
    for (const w of ['+5511987654321', '(11) 98765-4321', '11abc87654321']) {
      expect(ok(esquemaTenant.safeParse({ ...valido, whatsapp: w }))).toBe(false);
    }
  });
  it('prazo de cancelamento: 0 a 43200, inteiro (RN16)', () => {
    expect(ok(esquemaTenant.safeParse({ ...valido, prazo_cancelamento_min: 43200 }))).toBe(true);
    expect(ok(esquemaTenant.safeParse({ ...valido, prazo_cancelamento_min: 43201 }))).toBe(false);
    expect(ok(esquemaTenant.safeParse({ ...valido, prazo_cancelamento_min: -1 }))).toBe(false);
    expect(ok(esquemaTenant.safeParse({ ...valido, prazo_cancelamento_min: 1.5 }))).toBe(false);
  });
  it('tema fora dos 8 presets é rejeitado (sem cor livre)', () => {
    expect(ok(esquemaTenant.safeParse({ ...valido, tema: '#FF0000' }))).toBe(false);
    expect(ok(esquemaTenant.safeParse({ ...valido, tema: 'inexistente' }))).toBe(false);
  });
  it('aceita todos os 8 temas', () => {
    for (const tema of ['salvia','petroleo','terracota','lavanda','rose','grafite','onix','meia_noite']) {
      expect(ok(esquemaTenant.safeParse({ ...valido, tema }))).toBe(true);
    }
  });
  it('slug inválido e nome vazio são rejeitados', () => {
    expect(ok(esquemaTenant.safeParse({ ...valido, slug: 'Slug Ruim' }))).toBe(false);
    expect(ok(esquemaTenant.safeParse({ ...valido, nome: '' }))).toBe(false);
  });
});

describe('esquemaProfissional (D1)', () => {
  const valido = { especialidade: 'Cabeleireira', percentual_repasse: 3000, ativo: true };
  it('aceita válido', () => {
    expect(ok(esquemaProfissional.safeParse(valido))).toBe(true);
  });
  it('percentual de 0 a 10000 inclusive', () => {
    expect(ok(esquemaProfissional.safeParse({ ...valido, percentual_repasse: 0 }))).toBe(true);
    expect(ok(esquemaProfissional.safeParse({ ...valido, percentual_repasse: 10000 }))).toBe(true);
  });
  it('rejeita percentual fora do intervalo ou não inteiro', () => {
    for (const p of [-1, 10001, 30.5]) {
      expect(ok(esquemaProfissional.safeParse({ ...valido, percentual_repasse: p }))).toBe(false);
    }
  });
  it('ativo precisa ser booleano', () => {
    expect(ok(esquemaProfissional.safeParse({ ...valido, ativo: 'sim' }))).toBe(false);
  });
});

describe('esquemaServico', () => {
  const valido = { nome: 'Corte', duracao_min: 30, preco: 5000, ativo: true };
  it('aceita válido', () => {
    expect(ok(esquemaServico.safeParse(valido))).toBe(true);
  });
  it('duração: 5 a 720, inteira', () => {
    expect(ok(esquemaServico.safeParse({ ...valido, duracao_min: 5 }))).toBe(true);
    expect(ok(esquemaServico.safeParse({ ...valido, duracao_min: 720 }))).toBe(true);
    expect(ok(esquemaServico.safeParse({ ...valido, duracao_min: 4 }))).toBe(false);
    expect(ok(esquemaServico.safeParse({ ...valido, duracao_min: 721 }))).toBe(false);
    expect(ok(esquemaServico.safeParse({ ...valido, duracao_min: 30.5 }))).toBe(false);
  });
  it('preço em centavos: zero é aceito; negativo e decimal não', () => {
    expect(ok(esquemaServico.safeParse({ ...valido, preco: 0 }))).toBe(true);
    expect(ok(esquemaServico.safeParse({ ...valido, preco: -1 }))).toBe(false);
    expect(ok(esquemaServico.safeParse({ ...valido, preco: 49.9 }))).toBe(false);
  });
  it('D27: sigiloso extra é aceito (chave ignorada) mas não aparece no resultado', () => {
    const r = esquemaServico.safeParse({ ...valido, sigiloso: true });
    expect(r.success).toBe(true);
    if (r.success) {
      expect('sigiloso' in r.data).toBe(false);
      expect(r.data).toEqual(valido);
    }
  });
  it('D27: sem sigiloso, o serviço válido é aceito e o resultado não o contém', () => {
    const r = esquemaServico.safeParse(valido);
    expect(r.success).toBe(true);
    if (r.success) expect('sigiloso' in r.data).toBe(false);
  });
  it('D27: ativo continua obrigatório e booleano', () => {
    expect(ok(esquemaServico.safeParse({ ...valido, ativo: 'sim' }))).toBe(false);
  });
  it('nome vazio é rejeitado', () => {
    expect(ok(esquemaServico.safeParse({ ...valido, nome: '' }))).toBe(false);
  });
});

describe('esquemaHorarioAtendimento (D6)', () => {
  const valido = { profissional_id: UUID, dia_semana: 3, hora_inicio: '09:00', hora_fim: '12:00' };
  it('aceita válido', () => {
    expect(ok(esquemaHorarioAtendimento.safeParse(valido))).toBe(true);
  });
  it('dia da semana 0..6', () => {
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, dia_semana: 0 }))).toBe(true);
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, dia_semana: 6 }))).toBe(true);
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, dia_semana: 7 }))).toBe(false);
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, dia_semana: -1 }))).toBe(false);
  });
  it('fim deve ser maior que início', () => {
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, hora_inicio: '12:00', hora_fim: '12:00' }))).toBe(false);
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, hora_inicio: '13:00', hora_fim: '12:00' }))).toBe(false);
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, hora_inicio: '09:00', hora_fim: '09:15' }))).toBe(true);
  });
  it('profissional_id precisa ser UUID', () => {
    expect(ok(esquemaHorarioAtendimento.safeParse({ ...valido, profissional_id: 'abc' }))).toBe(false);
  });
});

describe('esquemaBloqueio', () => {
  const valido = {
    profissional_id: UUID,
    inicio: '2026-11-11T09:00:00-03:00',
    fim: '2026-11-11T12:00:00-03:00',
    motivo: 'Consulta médica',
  };
  it('aceita válido, com motivo null', () => {
    expect(ok(esquemaBloqueio.safeParse(valido))).toBe(true);
    expect(ok(esquemaBloqueio.safeParse({ ...valido, motivo: null }))).toBe(true);
  });
  it('aceita ISO com Z', () => {
    expect(
      ok(esquemaBloqueio.safeParse({ ...valido, inicio: '2026-11-11T12:00:00Z', fim: '2026-11-11T15:00:00Z' })),
    ).toBe(true);
  });
  it('fim deve ser maior que início', () => {
    expect(ok(esquemaBloqueio.safeParse({ ...valido, fim: valido.inicio }))).toBe(false);
    expect(ok(esquemaBloqueio.safeParse({ ...valido, fim: '2026-11-11T08:00:00-03:00' }))).toBe(false);
  });
  it('comparação considera o offset (mesmo instante em offsets diferentes não é válido)', () => {
    expect(
      ok(esquemaBloqueio.safeParse({ ...valido, inicio: '2026-11-11T09:00:00-03:00', fim: '2026-11-11T12:00:00Z' })),
    ).toBe(false);
  });
  it('rejeita datas sem offset ou texto livre', () => {
    expect(ok(esquemaBloqueio.safeParse({ ...valido, inicio: '2026-11-11T09:00:00' }))).toBe(false);
    expect(ok(esquemaBloqueio.safeParse({ ...valido, inicio: 'amanhã' }))).toBe(false);
  });
});

describe('esquemaNovoAgendamento', () => {
  const valido = {
    profissional_id: UUID,
    servico_ids: [UUID2],
    inicio: '2026-11-11T09:00:00-03:00',
    observacao: null,
  };
  it('aceita válido', () => {
    expect(ok(esquemaNovoAgendamento.safeParse(valido))).toBe(true);
  });
  it('aceita observação em texto e vários serviços', () => {
    expect(
      ok(esquemaNovoAgendamento.safeParse({ ...valido, servico_ids: [UUID, UUID2], observacao: 'Alergia a amônia' })),
    ).toBe(true);
  });
  it('exige ao menos um serviço', () => {
    expect(ok(esquemaNovoAgendamento.safeParse({ ...valido, servico_ids: [] }))).toBe(false);
  });
  it('serviço com id inválido é rejeitado', () => {
    expect(ok(esquemaNovoAgendamento.safeParse({ ...valido, servico_ids: ['x'] }))).toBe(false);
  });
  it('início sem offset é rejeitado', () => {
    expect(ok(esquemaNovoAgendamento.safeParse({ ...valido, inicio: '2026-11-11 09:00' }))).toBe(false);
  });
  it('profissional_id inválido é rejeitado', () => {
    expect(ok(esquemaNovoAgendamento.safeParse({ ...valido, profissional_id: '123' }))).toBe(false);
  });
});

describe('esquemaRemarcacao (D14)', () => {
  it('aceita válido', () => {
    expect(
      ok(esquemaRemarcacao.safeParse({ agendamento_id: UUID, novo_inicio: '2026-11-12T10:00:00-03:00' })),
    ).toBe(true);
  });
  it('rejeita id inválido e data sem offset', () => {
    expect(ok(esquemaRemarcacao.safeParse({ agendamento_id: 'x', novo_inicio: '2026-11-12T10:00:00-03:00' }))).toBe(false);
    expect(ok(esquemaRemarcacao.safeParse({ agendamento_id: UUID, novo_inicio: '2026-11-12T10:00:00' }))).toBe(false);
  });
});

describe('esquemaConclusao (RN07, RN08, D3)', () => {
  const valido = { agendamento_id: UUID, ajuste: -2000, forma_pagamento: 'pix' };
  it('aceita ajuste negativo, zero e positivo', () => {
    for (const a of [-2000, 0, 1500]) {
      expect(ok(esquemaConclusao.safeParse({ ...valido, ajuste: a }))).toBe(true);
    }
  });
  it('rejeita ajuste decimal', () => {
    expect(ok(esquemaConclusao.safeParse({ ...valido, ajuste: -20.5 }))).toBe(false);
  });
  it('aceita pix, dinheiro e cartao', () => {
    for (const f of ['pix', 'dinheiro', 'cartao']) {
      expect(ok(esquemaConclusao.safeParse({ ...valido, forma_pagamento: f }))).toBe(true);
    }
  });
  it('rejeita forma de pagamento desconhecida', () => {
    expect(ok(esquemaConclusao.safeParse({ ...valido, forma_pagamento: 'boleto' }))).toBe(false);
  });
  it('rejeita id inválido', () => {
    expect(ok(esquemaConclusao.safeParse({ ...valido, agendamento_id: 'x' }))).toBe(false);
  });
});

describe('esquemaDispositivoPush', () => {
  it('aceita as 3 plataformas', () => {
    for (const plataforma of ['android', 'ios', 'web']) {
      expect(ok(esquemaDispositivoPush.safeParse({ token: 'ExponentPushToken[abc]', plataforma }))).toBe(true);
    }
  });
  it('rejeita plataforma desconhecida e token vazio', () => {
    expect(ok(esquemaDispositivoPush.safeParse({ token: 'abc', plataforma: 'windows' }))).toBe(false);
    expect(ok(esquemaDispositivoPush.safeParse({ token: '', plataforma: 'android' }))).toBe(false);
  });
});
