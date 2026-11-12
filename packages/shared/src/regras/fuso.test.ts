import { describe, it, expect } from 'vitest';
import {
  ErroRegraNegocio,
  DESLOCAMENTO_UTC_MIN,
  horaParaMinutos,
  paraInstante,
  dataLocal,
  horaLocal,
  diaDaSemana,
  somarDias,
  hoje,
  amanha,
  formatarDataHora,
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

describe('fuso America/Sao_Paulo (-03:00 fixo)', () => {
  it('deslocamento é 180 minutos', () => {
    expect(DESLOCAMENTO_UTC_MIN).toBe(180);
  });

  describe('horaParaMinutos', () => {
    it('converte HH:MM', () => {
      expect(horaParaMinutos('00:00')).toBe(0);
      expect(horaParaMinutos('09:00')).toBe(540);
      expect(horaParaMinutos('18:30')).toBe(1110);
      expect(horaParaMinutos('23:59')).toBe(1439);
    });
    it('aceita HH:MM:SS', () => {
      expect(horaParaMinutos('09:30:00')).toBe(570);
    });
    it('aceita 24:00 como 1440', () => {
      expect(horaParaMinutos('24:00')).toBe(1440);
    });
    it('rejeita formatos e valores inválidos', () => {
      for (const h of ['24:01', '9:00', '12:60', '25:00', 'abc', '', '12-30']) {
        expect(codigoDoErro(() => horaParaMinutos(h))).toBe('HORA_INVALIDA');
      }
    });
  });

  describe('paraInstante', () => {
    it('09:00 local = 12:00Z', () => {
      expect(paraInstante('2026-11-11', '09:00').toISOString()).toBe('2026-11-11T12:00:00.000Z');
    });
    it('21:00 local cruza a meia-noite UTC', () => {
      expect(paraInstante('2026-11-11', '21:00').toISOString()).toBe('2026-11-12T00:00:00.000Z');
    });
    it('00:00 local = 03:00Z', () => {
      expect(paraInstante('2026-11-11', '00:00').toISOString()).toBe('2026-11-11T03:00:00.000Z');
    });
    it('data inexistente ou em outro formato → DATA_INVALIDA', () => {
      for (const d of ['2026-02-30', '2026-13-01', '11/11/2026', '2026-1-1', '']) {
        expect(codigoDoErro(() => paraInstante(d, '09:00'))).toBe('DATA_INVALIDA');
      }
    });
    it('29/02 só é válido em ano bissexto', () => {
      expect(paraInstante('2028-02-29', '10:00').toISOString()).toBe('2028-02-29T13:00:00.000Z');
      expect(codigoDoErro(() => paraInstante('2026-02-29', '10:00'))).toBe('DATA_INVALIDA');
    });
    it('hora inválida → HORA_INVALIDA', () => {
      expect(codigoDoErro(() => paraInstante('2026-11-11', '25:00'))).toBe('HORA_INVALIDA');
    });
  });

  describe('dataLocal / horaLocal', () => {
    it('02:30Z ainda é o dia anterior no fuso local', () => {
      const i = new Date('2026-11-12T02:30:00Z');
      expect(dataLocal(i)).toBe('2026-11-11');
      expect(horaLocal(i)).toBe('23:30');
    });
    it('03:00Z é meia-noite local do dia', () => {
      const i = new Date('2026-11-12T03:00:00Z');
      expect(dataLocal(i)).toBe('2026-11-12');
      expect(horaLocal(i)).toBe('00:00');
    });
    it('02:59:59Z ainda é o dia anterior', () => {
      expect(dataLocal(new Date('2026-11-12T02:59:59Z'))).toBe('2026-11-11');
    });
    it('ida e volta com paraInstante', () => {
      const i = paraInstante('2026-12-31', '23:45');
      expect(dataLocal(i)).toBe('2026-12-31');
      expect(horaLocal(i)).toBe('23:45');
    });
  });

  describe('diaDaSemana', () => {
    it('2026-11-11 é quarta (3)', () => {
      expect(diaDaSemana('2026-11-11')).toBe(3);
    });
    it('domingo é 0 e sábado é 6', () => {
      expect(diaDaSemana('2026-11-08')).toBe(0);
      expect(diaDaSemana('2026-11-14')).toBe(6);
    });
  });

  describe('somarDias', () => {
    it('soma dentro do mês', () => {
      expect(somarDias('2026-11-11', 1)).toBe('2026-11-12');
    });
    it('atravessa mês', () => {
      expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    });
    it('atravessa ano', () => {
      expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    });
    it('zero mantém e negativo volta', () => {
      expect(somarDias('2026-11-11', 0)).toBe('2026-11-11');
      expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    });
    it('fevereiro bissexto', () => {
      expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
      expect(somarDias('2026-02-28', 1)).toBe('2026-03-01');
    });
  });

  describe('hoje / amanha', () => {
    it('01:00Z de 12/11 ainda é dia 11 local', () => {
      const agora = new Date('2026-11-12T01:00:00Z');
      expect(hoje(agora)).toBe('2026-11-11');
      expect(amanha(agora)).toBe('2026-11-12');
    });
    it('03:00Z já é o dia 12 local', () => {
      const agora = new Date('2026-11-12T03:00:00Z');
      expect(hoje(agora)).toBe('2026-11-12');
      expect(amanha(agora)).toBe('2026-11-13');
    });
    it('amanhã atravessa o fim do ano', () => {
      expect(amanha(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    });
  });

  describe('formatarDataHora', () => {
    it('formata DD/MM/AAAA HH:MM no fuso local', () => {
      expect(formatarDataHora(new Date('2026-11-11T12:00:00Z'))).toBe('11/11/2026 09:00');
    });
    it('usa o dia local, não o UTC', () => {
      expect(formatarDataHora(new Date('2026-11-12T02:30:00Z'))).toBe('11/11/2026 23:30');
    });
  });
});
