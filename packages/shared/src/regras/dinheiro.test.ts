import { describe, it, expect } from 'vitest';
import {
  ErroRegraNegocio,
  calcularValorBruto,
  calcularValorLiquido,
  calcularDivisao,
  calcularConclusao,
  formatarReais,
  formatarPercentual,
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

describe('CLAUDE.md seção 4: dinheiro em centavos inteiros, sem ponto flutuante', () => {
  it('todos os resultados da conclusão são inteiros', () => {
    const r = calcularConclusao({ precosServicos: [3333, 1], ajuste: -1, percentualRepasse: 3333 });
    for (const v of [r.valorBruto, r.ajuste, r.valorLiquido, r.valorClinica, r.valorProfissional]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(r.valorClinica + r.valorProfissional).toBe(r.valorLiquido);
  });

  it('não acumula erro de ponto flutuante ao somar (R$ 0,10 + R$ 0,20)', () => {
    expect(calcularValorBruto([10, 20])).toBe(30);
  });

  it('rejeita valores decimais, NaN e Infinity', () => {
    for (const v of [0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codigoDoErro(() => calcularValorBruto([v]))).toBe('VALOR_INVALIDO');
      expect(codigoDoErro(() => calcularValorLiquido(v, 0))).toBe('VALOR_INVALIDO');
    }
  });

  it('valores grandes seguem exatos', () => {
    const d = calcularDivisao(99999999, 3333);
    expect(d.valorClinica + d.valorProfissional).toBe(99999999);
  });

  it('formatarReais: R$ 0,01 e R$ 1,00', () => {
    const n = (s: string) => s.replace(/\s/g, ' ');
    expect(n(formatarReais(1))).toBe('R$ 0,01');
    expect(n(formatarReais(100))).toBe('R$ 1,00');
    expect(n(formatarReais(-5))).toBe('-R$ 0,05');
  });

  it('formatarPercentual mostra pontos-base com duas casas', () => {
    expect(formatarPercentual(1)).toBe('0,01%');
    expect(formatarPercentual(3333)).toBe('33,33%');
  });
});
