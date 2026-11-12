import { describe, it, expect } from 'vitest';
import {
  ErroRegraNegocio,
  PASSO_MINUTOS,
  calcularDuracaoTotal,
  calcularFim,
  haSobreposicao,
  calcularHorariosLivres,
  paraInstante,
  horaLocal,
} from '../index';

function codigoDoErro(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroRegraNegocio) return e.codigo;
    throw e;
  }
  return undefined;
}

// 2026-11-11 é quarta-feira (dia_semana 3)
const DATA = '2026-11-11';
const DIA = 3;
const AGORA_PASSADO = new Date('2026-11-10T12:00:00Z');
const horas = (r: Date[]) => r.map(horaLocal);
const t = (h: string) => paraInstante(DATA, h);
const faixa = (ini: string, fim: string) => ({ inicio: t(ini), fim: t(fim) });
const periodo = (ini: string, fim: string, dia = DIA) => ({
  dia_semana: dia,
  hora_inicio: ini,
  hora_fim: fim,
});

describe('RN13: duração total = soma das durações', () => {
  it('soma durações', () => {
    expect(calcularDuracaoTotal([30, 45])).toBe(75);
    expect(calcularDuracaoTotal([60])).toBe(60);
  });
  it('lista vazia → DURACAO_INVALIDA', () => {
    expect(codigoDoErro(() => calcularDuracaoTotal([]))).toBe('DURACAO_INVALIDA');
  });
  it('duração zero, negativa ou não inteira → DURACAO_INVALIDA', () => {
    for (const d of [0, -15, 30.5]) {
      expect(codigoDoErro(() => calcularDuracaoTotal([30, d]))).toBe('DURACAO_INVALIDA');
    }
  });
});

describe('calcularFim', () => {
  it('fim = início + duração', () => {
    const fim = calcularFim(new Date('2026-11-11T12:00:00Z'), 75);
    expect(fim.toISOString()).toBe('2026-11-11T13:15:00.000Z');
  });
});

describe('RN12: haSobreposicao (intervalo semiaberto)', () => {
  const a = faixa('09:00', '10:00');
  it('encostar não é sobreposição (fim de A = início de B)', () => {
    expect(haSobreposicao(a, faixa('10:00', '11:00'))).toBe(false);
    expect(haSobreposicao(faixa('10:00', '11:00'), a)).toBe(false);
  });
  it('sobreposição parcial', () => {
    expect(haSobreposicao(a, faixa('09:30', '10:30'))).toBe(true);
    expect(haSobreposicao(faixa('09:30', '10:30'), a)).toBe(true);
  });
  it('um contido no outro', () => {
    expect(haSobreposicao(a, faixa('09:15', '09:45'))).toBe(true);
    expect(haSobreposicao(faixa('09:15', '09:45'), a)).toBe(true);
  });
  it('idênticos', () => {
    expect(haSobreposicao(a, faixa('09:00', '10:00'))).toBe(true);
  });
  it('disjuntos', () => {
    expect(haSobreposicao(a, faixa('11:00', '12:00'))).toBe(false);
  });
  it('sobreposição de 1 minuto', () => {
    expect(haSobreposicao(a, faixa('09:59', '10:30'))).toBe(true);
  });
});

describe('RF21: calcularHorariosLivres', () => {
  it('PASSO_MINUTOS é 15 (D5)', () => {
    expect(PASSO_MINUTOS).toBe(15);
  });

  it('expediente 09-12, 60 min: inícios de 09:00 a 11:00 (encostar no fim é permitido)', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 60,
      expediente: [periodo('09:00', '12:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).toEqual([
      '09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00',
    ]);
  });

  it('atendimento que ultrapassa o fim do expediente não é oferecido', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 60,
      expediente: [periodo('09:00', '12:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).not.toContain('11:15');
    expect(horas(r)).not.toContain('11:45');
  });

  it('duração igual ao período inteiro: um único horário', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 180,
      expediente: [periodo('09:00', '12:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).toEqual(['09:00']);
  });

  it('duração maior que o período: nenhum horário', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 181,
      expediente: [periodo('09:00', '12:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(r).toEqual([]);
  });

  it('grade de 15 min contada da meia-noite: período às 09:10 começa em 09:15', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 30,
      expediente: [periodo('09:10', '10:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).toEqual(['09:15', '09:30']);
  });

  it('D6: vários períodos no mesmo dia', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 60,
      expediente: [periodo('09:00', '11:00'), periodo('14:00', '16:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).toEqual([
      '09:00', '09:15', '09:30', '09:45', '10:00',
      '14:00', '14:15', '14:30', '14:45', '15:00',
    ]);
  });

  it('atendimento não atravessa o intervalo entre dois períodos', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 60,
      expediente: [periodo('09:00', '10:00'), periodo('10:30', '12:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).toContain('09:00');
    expect(horas(r)).not.toContain('09:15');
    expect(horas(r)).not.toContain('10:00');
    expect(horas(r)).toContain('10:30');
  });

  it('períodos sobrepostos/duplicados não geram repetição e saída é ordenada', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 30,
      expediente: [periodo('14:00', '15:00'), periodo('09:00', '10:00'), periodo('09:30', '10:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    const ms = r.map((d) => d.getTime());
    expect(new Set(ms).size).toBe(ms.length);
    expect([...ms].sort((x, y) => x - y)).toEqual(ms);
    expect(horas(r)).toEqual(['09:00', '09:15', '09:30', '14:00', '14:15', '14:30']);
  });

  it('filtra períodos pelo dia da semana da data', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 60,
      expediente: [periodo('09:00', '12:00', 4), periodo('13:00', '14:00', DIA)],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(horas(r)).toEqual(['13:00']);
  });

  it('sem expediente no dia: lista vazia', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 30,
      expediente: [periodo('09:00', '12:00', 0)],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(r).toEqual([]);
  });

  it('expediente vazio: lista vazia', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 30,
      expediente: [],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(r).toEqual([]);
  });

  describe('RN12: conflitos', () => {
    it('agendamento ocupado remove horários que se sobrepõem', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 60,
        expediente: [periodo('09:00', '12:00')],
        ocupados: [faixa('10:00', '11:00')],
        agora: AGORA_PASSADO,
      });
      expect(horas(r)).toEqual(['09:00', '11:00']);
    });

    it('encostar no ocupado é permitido (termina às 10:00 e começa às 11:00)', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 60,
        expediente: [periodo('09:00', '12:00')],
        ocupados: [faixa('10:00', '11:00')],
        agora: AGORA_PASSADO,
      });
      expect(horas(r)).toContain('09:00');
      expect(horas(r)).toContain('11:00');
      expect(horas(r)).not.toContain('09:15');
      expect(horas(r)).not.toContain('10:45');
    });

    it('vários ocupados', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '11:00')],
        ocupados: [faixa('09:00', '09:30'), faixa('10:00', '10:30')],
        agora: AGORA_PASSADO,
      });
      expect(horas(r)).toEqual(['09:30', '10:30']);
    });

    it('dia totalmente ocupado: lista vazia', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '10:00')],
        ocupados: [faixa('09:00', '10:00')],
        agora: AGORA_PASSADO,
      });
      expect(r).toEqual([]);
    });

    it('ocupado que começa antes do expediente e invade o início', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '10:00')],
        ocupados: [faixa('08:30', '09:15')],
        agora: AGORA_PASSADO,
      });
      expect(horas(r)).toEqual(['09:15', '09:30']);
    });

    it('ocupado em outro dia não interfere', () => {
      const outroDia = {
        inicio: paraInstante('2026-11-12', '09:00'),
        fim: paraInstante('2026-11-12', '10:00'),
      };
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 60,
        expediente: [periodo('09:00', '10:00')],
        ocupados: [outroDia],
        agora: AGORA_PASSADO,
      });
      expect(horas(r)).toEqual(['09:00']);
    });
  });

  describe('D5: "Hoje" só mostra horários futuros', () => {
    it('agora às 10:07: primeiro horário é 10:15', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '11:00')],
        ocupados: [],
        agora: t('10:07'),
      });
      expect(horas(r)).toEqual(['10:15', '10:30']);
    });

    it('agora exatamente em 10:00: 10:00 não é oferecido (estritamente futuro)', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '11:00')],
        ocupados: [],
        agora: t('10:00'),
      });
      expect(horas(r)).not.toContain('10:00');
      expect(horas(r)).toContain('10:15');
    });

    it('um milissegundo antes de 10:00: 10:00 é oferecido', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '11:00')],
        ocupados: [],
        agora: new Date(t('10:00').getTime() - 1),
      });
      expect(horas(r)).toContain('10:00');
    });

    it('agora depois do fim do expediente: vazio', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '11:00')],
        ocupados: [],
        agora: t('18:00'),
      });
      expect(r).toEqual([]);
    });

    it('sem antecedência mínima: agora 08:59 libera 09:00', () => {
      const r = calcularHorariosLivres({
        data: DATA,
        duracaoMin: 30,
        expediente: [periodo('09:00', '10:00')],
        ocupados: [],
        agora: t('08:59'),
      });
      expect(horas(r)[0]).toBe('09:00');
    });
  });

  describe('duração inválida', () => {
    it('zero, negativa, não inteira → DURACAO_INVALIDA', () => {
      for (const d of [0, -30, 22.5, Number.NaN]) {
        expect(
          codigoDoErro(() =>
            calcularHorariosLivres({
              data: DATA,
              duracaoMin: d,
              expediente: [periodo('09:00', '12:00')],
              ocupados: [],
              agora: AGORA_PASSADO,
            }),
          ),
        ).toBe('DURACAO_INVALIDA');
      }
    });
  });

  it('retorna instantes UTC corretos (09:00 local = 12:00Z)', () => {
    const r = calcularHorariosLivres({
      data: DATA,
      duracaoMin: 60,
      expediente: [periodo('09:00', '10:00')],
      ocupados: [],
      agora: AGORA_PASSADO,
    });
    expect(r.map((d) => d.toISOString())).toEqual(['2026-11-11T12:00:00.000Z']);
  });
});
