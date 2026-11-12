import { describe, it, expect } from 'vitest';
import {
  ErroRegraNegocio,
  STATUS_AGENDAMENTO,
  PAPEIS_POR_ACAO,
  MOTIVO_CANCELAMENTO_PROFISSIONAL_INDISPONIVEL,
  ESTADOS_QUE_OCUPAM,
  ehEstadoFinal,
  ocupaHorario,
  proximoEstado,
  transicaoValida,
  dentroDoPrazo,
  verificarAcao,
} from '../index';
import type { AcaoAgendamento, PapelNaAcao } from '../index';

function codigoDoErro(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroRegraNegocio) return e.codigo;
    throw e;
  }
  return undefined;
}

const MIN = 60_000;
const inicio = new Date('2026-11-11T12:00:00Z');
const antes = (min: number) => new Date(inicio.getTime() - min * MIN);
const depois = (min: number) => new Date(inicio.getTime() + min * MIN);

const finais = ['CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU'] as const;
const acoes: AcaoAgendamento[] = ['concluir', 'cancelar', 'marcar_nao_compareceu', 'remarcar'];

describe('5.2: estados finais e ocupação (D12)', () => {
  it('só AGENDADO não é final', () => {
    expect(ehEstadoFinal('AGENDADO')).toBe(false);
    for (const s of finais) expect(ehEstadoFinal(s)).toBe(true);
  });

  it('D12: AGENDADO, CONCLUIDO e NAO_COMPARECEU ocupam; CANCELADO libera', () => {
    expect(ocupaHorario('AGENDADO')).toBe(true);
    expect(ocupaHorario('CONCLUIDO')).toBe(true);
    expect(ocupaHorario('NAO_COMPARECEU')).toBe(true);
    expect(ocupaHorario('CANCELADO')).toBe(false);
  });

  it('ESTADOS_QUE_OCUPAM tem exatamente 3 estados, sem CANCELADO', () => {
    expect([...ESTADOS_QUE_OCUPAM].sort()).toEqual(['AGENDADO', 'CONCLUIDO', 'NAO_COMPARECEU']);
  });
});

describe('5.2: proximoEstado', () => {
  it('concluir → CONCLUIDO', () => {
    expect(proximoEstado('AGENDADO', 'concluir')).toBe('CONCLUIDO');
  });
  it('cancelar → CANCELADO', () => {
    expect(proximoEstado('AGENDADO', 'cancelar')).toBe('CANCELADO');
  });
  it('marcar_nao_compareceu → NAO_COMPARECEU', () => {
    expect(proximoEstado('AGENDADO', 'marcar_nao_compareceu')).toBe('NAO_COMPARECEU');
  });
  it('remarcar mantém AGENDADO', () => {
    expect(proximoEstado('AGENDADO', 'remarcar')).toBe('AGENDADO');
  });
  it('estados finais não mudam: qualquer ação gera ESTADO_FINAL', () => {
    for (const s of finais) {
      for (const a of acoes) {
        expect(codigoDoErro(() => proximoEstado(s, a))).toBe('ESTADO_FINAL');
      }
    }
  });
});

describe('5.2: transicaoValida', () => {
  it('de AGENDADO para qualquer um dos 4 estados é válida', () => {
    for (const para of STATUS_AGENDAMENTO) {
      expect(transicaoValida('AGENDADO', para)).toBe(true);
    }
  });
  it('de estados finais para qualquer estado é inválida', () => {
    for (const de of finais) {
      for (const para of STATUS_AGENDAMENTO) {
        expect(transicaoValida(de, para)).toBe(false);
      }
    }
  });
  it('reabrir um cancelado é inválido', () => {
    expect(transicaoValida('CANCELADO', 'AGENDADO')).toBe(false);
  });
});

describe('RN03: papéis por ação', () => {
  it('concluir e marcar_nao_compareceu: só profissional', () => {
    expect(PAPEIS_POR_ACAO.concluir).toEqual(['profissional']);
    expect(PAPEIS_POR_ACAO.marcar_nao_compareceu).toEqual(['profissional']);
  });
  it('D26: cancelar e remarcar: cliente e profissional; admin não', () => {
    for (const a of ['cancelar', 'remarcar'] as const) {
      expect([...PAPEIS_POR_ACAO[a]].sort()).toEqual(['cliente', 'profissional']);
      expect(PAPEIS_POR_ACAO[a]).not.toContain('admin');
    }
  });
});

describe('D26: motivo de cancelamento por indisponibilidade', () => {
  it('MOTIVO_CANCELAMENTO_PROFISSIONAL_INDISPONIVEL é "Profissional indisponível"', () => {
    expect(MOTIVO_CANCELAMENTO_PROFISSIONAL_INDISPONIVEL).toBe('Profissional indisponível');
  });
});

describe('RN16/D26: dentroDoPrazo', () => {
  it('prazo 0 = sem prazo, mesmo no instante do início', () => {
    expect(dentroDoPrazo(inicio, inicio, 0)).toBe(true);
    expect(dentroDoPrazo(inicio, antes(1), 0)).toBe(true);
  });
  it('D26: prazo 0 = sem prazo, também depois do início', () => {
    expect(dentroDoPrazo(inicio, depois(1), 0)).toBe(true);
    expect(dentroDoPrazo(inicio, depois(600), 0)).toBe(true);
  });
  it('RN16: prazo > 0 depois do início é false', () => {
    expect(dentroDoPrazo(inicio, inicio, 120)).toBe(false);
    expect(dentroDoPrazo(inicio, depois(1), 120)).toBe(false);
    expect(dentroDoPrazo(inicio, depois(1), 1)).toBe(false);
  });
  it('exatamente no limite (inclusive)', () => {
    expect(dentroDoPrazo(inicio, antes(120), 120)).toBe(true);
  });
  it('um minuto antes do limite: dentro', () => {
    expect(dentroDoPrazo(inicio, antes(121), 120)).toBe(true);
  });
  it('um minuto depois do limite: fora', () => {
    expect(dentroDoPrazo(inicio, antes(119), 120)).toBe(false);
  });
  it('um milissegundo depois do limite: fora', () => {
    const agora = new Date(antes(120).getTime() + 1);
    expect(dentroDoPrazo(inicio, agora, 120)).toBe(false);
  });
  it('prazo negativo → VALOR_INVALIDO', () => {
    expect(codigoDoErro(() => dentroDoPrazo(inicio, antes(10), -1))).toBe('VALOR_INVALIDO');
  });
  it('prazo não inteiro → VALOR_INVALIDO', () => {
    expect(codigoDoErro(() => dentroDoPrazo(inicio, antes(10), 1.5))).toBe('VALOR_INVALIDO');
  });
});

describe('verificarAcao', () => {
  const base = { status: 'AGENDADO' as const, inicio, prazoCancelamentoMin: 0 };

  describe('concluir (D7, RN03)', () => {
    it('profissional conclui a partir do início exato', () => {
      expect(verificarAcao({ ...base, acao: 'concluir', papel: 'profissional', agora: inicio })).toBe(
        'CONCLUIDO',
      );
    });
    it('profissional conclui depois do início', () => {
      expect(
        verificarAcao({ ...base, acao: 'concluir', papel: 'profissional', agora: depois(30) }),
      ).toBe('CONCLUIDO');
    });
    it('antes do início → ANTES_DO_INICIO', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({ ...base, acao: 'concluir', papel: 'profissional', agora: antes(1) }),
        ),
      ).toBe('ANTES_DO_INICIO');
    });
    it('1 ms antes do início → ANTES_DO_INICIO', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({
            ...base,
            acao: 'concluir',
            papel: 'profissional',
            agora: new Date(inicio.getTime() - 1),
          }),
        ),
      ).toBe('ANTES_DO_INICIO');
    });
    it('admin e cliente não concluem → PAPEL_SEM_PERMISSAO', () => {
      for (const papel of ['admin', 'cliente'] as PapelNaAcao[]) {
        expect(
          codigoDoErro(() => verificarAcao({ ...base, acao: 'concluir', papel, agora: depois(5) })),
        ).toBe('PAPEL_SEM_PERMISSAO');
      }
    });
  });

  describe('marcar_nao_compareceu (D7)', () => {
    it('profissional marca a partir do início', () => {
      expect(
        verificarAcao({ ...base, acao: 'marcar_nao_compareceu', papel: 'profissional', agora: inicio }),
      ).toBe('NAO_COMPARECEU');
    });
    it('antes do início → ANTES_DO_INICIO', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({
            ...base,
            acao: 'marcar_nao_compareceu',
            papel: 'profissional',
            agora: antes(5),
          }),
        ),
      ).toBe('ANTES_DO_INICIO');
    });
    it('admin e cliente → PAPEL_SEM_PERMISSAO', () => {
      for (const papel of ['admin', 'cliente'] as PapelNaAcao[]) {
        expect(
          codigoDoErro(() =>
            verificarAcao({ ...base, acao: 'marcar_nao_compareceu', papel, agora: depois(5) }),
          ),
        ).toBe('PAPEL_SEM_PERMISSAO');
      }
    });
  });

  describe('cancelar e remarcar (D26, RN16)', () => {
    it('D26: cliente e profissional cancelam antes do início, sem prazo', () => {
      for (const papel of ['cliente', 'profissional'] as PapelNaAcao[]) {
        expect(verificarAcao({ ...base, acao: 'cancelar', papel, agora: antes(1) })).toBe('CANCELADO');
      }
    });
    it('D26: cliente e profissional remarcam antes do início e o estado segue AGENDADO', () => {
      for (const papel of ['cliente', 'profissional'] as PapelNaAcao[]) {
        expect(verificarAcao({ ...base, acao: 'remarcar', papel, agora: antes(1) })).toBe('AGENDADO');
      }
    });
    it('D26: cliente e profissional cancelam/remarcam no instante exato do início', () => {
      for (const papel of ['cliente', 'profissional'] as PapelNaAcao[]) {
        expect(verificarAcao({ ...base, acao: 'cancelar', papel, agora: inicio })).toBe('CANCELADO');
        expect(verificarAcao({ ...base, acao: 'remarcar', papel, agora: inicio })).toBe('AGENDADO');
      }
    });
    it('D26: cliente (prazo 0) e profissional cancelam/remarcam depois do início', () => {
      for (const papel of ['cliente', 'profissional'] as PapelNaAcao[]) {
        expect(verificarAcao({ ...base, acao: 'cancelar', papel, agora: depois(10) })).toBe('CANCELADO');
        expect(verificarAcao({ ...base, acao: 'remarcar', papel, agora: depois(10) })).toBe('AGENDADO');
      }
    });
    it('D26: admin não cancela nem remarca, em qualquer momento → PAPEL_SEM_PERMISSAO', () => {
      for (const acao of ['cancelar', 'remarcar'] as const) {
        for (const agora of [antes(60), antes(1), inicio, depois(10)]) {
          expect(
            codigoDoErro(() => verificarAcao({ ...base, acao, papel: 'admin', agora })),
          ).toBe('PAPEL_SEM_PERMISSAO');
        }
      }
    });
    it('D26: DEPOIS_DO_INICIO não existe mais em nenhum cenário de cancelar/remarcar', () => {
      for (const papel of ['cliente', 'profissional', 'admin'] as PapelNaAcao[]) {
        for (const acao of ['cancelar', 'remarcar'] as const) {
          for (const agora of [antes(1), inicio, depois(10)]) {
            expect(
              codigoDoErro(() =>
                verificarAcao({ ...base, acao, papel, agora, prazoCancelamentoMin: 120 }),
              ),
            ).not.toBe('DEPOIS_DO_INICIO');
          }
        }
      }
    });
    it('RN16/D26: cliente com prazo 120 aceito com 121 min de antecedência', () => {
      expect(
        verificarAcao({
          ...base,
          acao: 'cancelar',
          papel: 'cliente',
          agora: antes(121),
          prazoCancelamentoMin: 120,
        }),
      ).toBe('CANCELADO');
      expect(
        verificarAcao({
          ...base,
          acao: 'remarcar',
          papel: 'cliente',
          agora: antes(121),
          prazoCancelamentoMin: 120,
        }),
      ).toBe('AGENDADO');
    });
    it('RN16/D26: cliente com prazo 120 e 119 min de antecedência → PRAZO_CANCELAMENTO', () => {
      for (const acao of ['cancelar', 'remarcar'] as const) {
        expect(
          codigoDoErro(() =>
            verificarAcao({
              ...base,
              acao,
              papel: 'cliente',
              agora: antes(119),
              prazoCancelamentoMin: 120,
            }),
          ),
        ).toBe('PRAZO_CANCELAMENTO');
      }
    });
    it('RN16/D26: cliente com prazo 120 depois do início → PRAZO_CANCELAMENTO', () => {
      for (const acao of ['cancelar', 'remarcar'] as const) {
        for (const agora of [inicio, depois(1)]) {
          expect(
            codigoDoErro(() =>
              verificarAcao({ ...base, acao, papel: 'cliente', agora, prazoCancelamentoMin: 120 }),
            ),
          ).toBe('PRAZO_CANCELAMENTO');
        }
      }
    });
    it('D26: profissional ignora o prazo 120, inclusive depois do início', () => {
      for (const agora of [antes(10), depois(30)]) {
        expect(
          verificarAcao({
            ...base,
            acao: 'cancelar',
            papel: 'profissional',
            agora,
            prazoCancelamentoMin: 120,
          }),
        ).toBe('CANCELADO');
        expect(
          verificarAcao({
            ...base,
            acao: 'remarcar',
            papel: 'profissional',
            agora,
            prazoCancelamentoMin: 120,
          }),
        ).toBe('AGENDADO');
      }
    });
    it('D26: cancelar/remarcar um estado final → ESTADO_FINAL', () => {
      for (const status of finais) {
        for (const acao of ['cancelar', 'remarcar'] as const) {
          for (const papel of ['cliente', 'profissional', 'admin'] as PapelNaAcao[]) {
            expect(
              codigoDoErro(() => verificarAcao({ ...base, status, acao, papel, agora: antes(60) })),
            ).toBe('ESTADO_FINAL');
          }
        }
      }
    });
    it('cliente fora do prazo → PRAZO_CANCELAMENTO (cancelar e remarcar)', () => {
      for (const acao of ['cancelar', 'remarcar'] as const) {
        expect(
          codigoDoErro(() =>
            verificarAcao({
              ...base,
              acao,
              papel: 'cliente',
              agora: antes(60),
              prazoCancelamentoMin: 120,
            }),
          ),
        ).toBe('PRAZO_CANCELAMENTO');
      }
    });
    it('cliente exatamente no limite do prazo é aceito', () => {
      expect(
        verificarAcao({
          ...base,
          acao: 'cancelar',
          papel: 'cliente',
          agora: antes(120),
          prazoCancelamentoMin: 120,
        }),
      ).toBe('CANCELADO');
    });
    it('D13: profissional ignora o prazo', () => {
      for (const acao of ['cancelar', 'remarcar'] as const) {
        expect(
          verificarAcao({
            ...base,
            acao,
            papel: 'profissional',
            agora: antes(10),
            prazoCancelamentoMin: 1440,
          }),
        ).toBe(acao === 'cancelar' ? 'CANCELADO' : 'AGENDADO');
      }
    });
  });

  describe('ordem das checagens', () => {
    it('estado final vence papel sem permissão', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({ ...base, status: 'CONCLUIDO', acao: 'concluir', papel: 'cliente', agora: depois(5) }),
        ),
      ).toBe('ESTADO_FINAL');
    });
    it('estado final vence momento inválido', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({ ...base, status: 'CANCELADO', acao: 'concluir', papel: 'profissional', agora: antes(60) }),
        ),
      ).toBe('ESTADO_FINAL');
    });
    it('papel vence momento: cliente tentando concluir antes do início → PAPEL_SEM_PERMISSAO', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({ ...base, acao: 'concluir', papel: 'cliente', agora: antes(60) }),
        ),
      ).toBe('PAPEL_SEM_PERMISSAO');
    });
    it('D26: papel vence prazo: admin fora do prazo → PAPEL_SEM_PERMISSAO', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({
            ...base,
            acao: 'cancelar',
            papel: 'admin',
            agora: antes(10),
            prazoCancelamentoMin: 120,
          }),
        ),
      ).toBe('PAPEL_SEM_PERMISSAO');
    });
    it('D26: cliente em concluir depois do início → PAPEL_SEM_PERMISSAO (momento não é checado antes do papel)', () => {
      expect(
        codigoDoErro(() =>
          verificarAcao({ ...base, acao: 'concluir', papel: 'cliente', agora: depois(1) }),
        ),
      ).toBe('PAPEL_SEM_PERMISSAO');
    });
  });

  it('qualquer ação em estado final → ESTADO_FINAL', () => {
    for (const status of finais) {
      for (const acao of acoes) {
        expect(
          codigoDoErro(() =>
            verificarAcao({ ...base, status, acao, papel: 'profissional', agora: depois(5) }),
          ),
        ).toBe('ESTADO_FINAL');
      }
    }
  });
});
