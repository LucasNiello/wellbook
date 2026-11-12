import { describe, it, expect } from 'vitest';
import {
  ErroRegraNegocio,
  PONTOS_BASE_TOTAL,
  calcularValorBruto,
  calcularValorLiquido,
  calcularDivisao,
  calcularConclusao,
  validarPercentual,
  formatarPercentual,
  formatarReais,
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

describe('RN07: valor bruto = soma dos preços dos serviços', () => {
  it('soma preços em centavos', () => {
    expect(calcularValorBruto([10000, 12000])).toBe(22000);
  });
  it('um único serviço', () => {
    expect(calcularValorBruto([4500])).toBe(4500);
  });
  it('lista vazia soma zero', () => {
    expect(calcularValorBruto([])).toBe(0);
  });
  it('preço zero é permitido', () => {
    expect(calcularValorBruto([0, 100])).toBe(100);
  });
  it('rejeita preço não inteiro', () => {
    expect(codigoDoErro(() => calcularValorBruto([10.5]))).toBe('VALOR_INVALIDO');
  });
  it('rejeita preço negativo', () => {
    expect(codigoDoErro(() => calcularValorBruto([100, -1]))).toBe('VALOR_INVALIDO');
  });
});

describe('RN08/D3: valor líquido = bruto + ajuste', () => {
  it('desconto (ajuste negativo)', () => {
    expect(calcularValorLiquido(22000, -2000)).toBe(20000);
  });
  it('adicional (ajuste positivo)', () => {
    expect(calcularValorLiquido(22000, 1500)).toBe(23500);
  });
  it('ajuste zero', () => {
    expect(calcularValorLiquido(22000, 0)).toBe(22000);
  });
  it('líquido zero é permitido (desconto total)', () => {
    expect(calcularValorLiquido(22000, -22000)).toBe(0);
  });
  it('líquido negativo é bloqueado (D3)', () => {
    expect(codigoDoErro(() => calcularValorLiquido(22000, -22001))).toBe('LIQUIDO_NEGATIVO');
  });
  it('rejeita ajuste não inteiro', () => {
    expect(codigoDoErro(() => calcularValorLiquido(22000, -0.5))).toBe('VALOR_INVALIDO');
  });
  it('rejeita bruto não inteiro', () => {
    expect(codigoDoErro(() => calcularValorLiquido(220.5, 0))).toBe('VALOR_INVALIDO');
  });
});

describe('RN09/D1/D2: divisão clínica/profissional', () => {
  it('RN09: bruto 22000, ajuste -2000, líquido 20000, 3000 pb → clínica 6000, profissional 14000', () => {
    const bruto = calcularValorBruto([22000]);
    const liquido = calcularValorLiquido(bruto, -2000);
    expect(liquido).toBe(20000);
    const divisao = calcularDivisao(liquido, 3000);
    expect(divisao.valorClinica).toBe(6000);
    expect(divisao.valorProfissional).toBe(14000);
  });

  it('PONTOS_BASE_TOTAL é 10000', () => {
    expect(PONTOS_BASE_TOTAL).toBe(10000);
  });

  it('RN09: repasse de 30% sobre líquido de R$ 200,00', () => {
    expect(calcularDivisao(20000, 3000)).toEqual({ valorClinica: 6000, valorProfissional: 14000 });
  });

  it('D2: centavo ímpar, 333 x 5000 → clínica 167 (166,5 sobe), profissional 166', () => {
    expect(calcularDivisao(333, 5000)).toEqual({ valorClinica: 167, valorProfissional: 166 });
  });

  it('D2: fração abaixo de meio arredonda para baixo (100 x 3333 = 33,33 → 33)', () => {
    expect(calcularDivisao(100, 3333)).toEqual({ valorClinica: 33, valorProfissional: 67 });
  });

  it('D2: exatamente meio centavo sobe (1 x 5000 = 0,5 → 1)', () => {
    expect(calcularDivisao(1, 5000)).toEqual({ valorClinica: 1, valorProfissional: 0 });
  });

  it('0% de repasse: clínica 0, profissional recebe tudo', () => {
    expect(calcularDivisao(20000, 0)).toEqual({ valorClinica: 0, valorProfissional: 20000 });
  });

  it('100% de repasse: clínica recebe tudo, profissional 0', () => {
    expect(calcularDivisao(20000, 10000)).toEqual({ valorClinica: 20000, valorProfissional: 0 });
  });

  it('líquido zero: ambos zero', () => {
    expect(calcularDivisao(0, 3000)).toEqual({ valorClinica: 0, valorProfissional: 0 });
  });

  it('a soma sempre fecha com o líquido (varredura)', () => {
    const liquidos = [0, 1, 2, 3, 7, 99, 333, 1001, 19999, 20000, 123457];
    const percentuais = [0, 1, 1250, 3000, 3333, 5000, 6667, 9999, 10000];
    for (const liquido of liquidos) {
      for (const pb of percentuais) {
        const { valorClinica, valorProfissional } = calcularDivisao(liquido, pb);
        expect(valorClinica + valorProfissional).toBe(liquido);
        expect(Number.isInteger(valorClinica)).toBe(true);
        expect(Number.isInteger(valorProfissional)).toBe(true);
        expect(valorClinica).toBeGreaterThanOrEqual(0);
        expect(valorProfissional).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rejeita percentual acima de 10000', () => {
    expect(codigoDoErro(() => calcularDivisao(20000, 10001))).toBe('PERCENTUAL_INVALIDO');
  });
  it('rejeita percentual negativo', () => {
    expect(codigoDoErro(() => calcularDivisao(20000, -1))).toBe('PERCENTUAL_INVALIDO');
  });
  it('rejeita percentual não inteiro', () => {
    expect(codigoDoErro(() => calcularDivisao(20000, 30.5))).toBe('PERCENTUAL_INVALIDO');
  });
});

describe('D1: validarPercentual', () => {
  it('aceita 0 e 10000 e valores intermediários', () => {
    expect(() => validarPercentual(0)).not.toThrow();
    expect(() => validarPercentual(3000)).not.toThrow();
    expect(() => validarPercentual(10000)).not.toThrow();
  });
  it('rejeita fora do intervalo, não inteiro e NaN', () => {
    expect(codigoDoErro(() => validarPercentual(-1))).toBe('PERCENTUAL_INVALIDO');
    expect(codigoDoErro(() => validarPercentual(10001))).toBe('PERCENTUAL_INVALIDO');
    expect(codigoDoErro(() => validarPercentual(1.5))).toBe('PERCENTUAL_INVALIDO');
    expect(codigoDoErro(() => validarPercentual(Number.NaN))).toBe('PERCENTUAL_INVALIDO');
  });
});

describe('RN07-RN10: calcularConclusao', () => {
  it('exemplo obrigatório: 220,00, ajuste -20,00, 30%', () => {
    const r = calcularConclusao({
      precosServicos: [22000],
      ajuste: -2000,
      percentualRepasse: 3000,
    });
    expect(r).toEqual({
      valorBruto: 22000,
      ajuste: -2000,
      valorLiquido: 20000,
      percentualRepasse: 3000,
      valorClinica: 6000,
      valorProfissional: 14000,
    });
  });

  it('vários serviços somam o bruto (D4)', () => {
    const r = calcularConclusao({
      precosServicos: [8000, 14000],
      ajuste: -2000,
      percentualRepasse: 3000,
    });
    expect(r.valorBruto).toBe(22000);
    expect(r.valorLiquido).toBe(20000);
  });

  it('ajuste positivo aumenta o líquido', () => {
    const r = calcularConclusao({ precosServicos: [10000], ajuste: 500, percentualRepasse: 5000 });
    expect(r.valorLiquido).toBe(10500);
    expect(r.valorClinica + r.valorProfissional).toBe(10500);
  });

  it('RN10: grava o percentual usado', () => {
    const r = calcularConclusao({ precosServicos: [10000], ajuste: 0, percentualRepasse: 4250 });
    expect(r.percentualRepasse).toBe(4250);
  });

  it('centavo ímpar na conclusão completa', () => {
    const r = calcularConclusao({ precosServicos: [333], ajuste: 0, percentualRepasse: 5000 });
    expect(r.valorClinica).toBe(167);
    expect(r.valorProfissional).toBe(166);
  });

  it('líquido negativo é bloqueado', () => {
    expect(
      codigoDoErro(() =>
        calcularConclusao({ precosServicos: [1000], ajuste: -1001, percentualRepasse: 3000 }),
      ),
    ).toBe('LIQUIDO_NEGATIVO');
  });

  it('percentual inválido é bloqueado', () => {
    expect(
      codigoDoErro(() =>
        calcularConclusao({ precosServicos: [1000], ajuste: 0, percentualRepasse: 10001 }),
      ),
    ).toBe('PERCENTUAL_INVALIDO');
  });
});

describe('formatação', () => {
  it('formatarPercentual', () => {
    expect(formatarPercentual(3000)).toBe('30,00%');
    expect(formatarPercentual(1250)).toBe('12,50%');
    expect(formatarPercentual(0)).toBe('0,00%');
    expect(formatarPercentual(10000)).toBe('100,00%');
  });

  it('formatarReais', () => {
    const normalizar = (s: string) => s.replace(/\s/g, ' ');
    expect(normalizar(formatarReais(22000))).toBe('R$ 220,00');
    expect(normalizar(formatarReais(-2000))).toBe('-R$ 20,00');
    expect(normalizar(formatarReais(123456789))).toBe('R$ 1.234.567,89');
    expect(normalizar(formatarReais(5))).toBe('R$ 0,05');
    expect(normalizar(formatarReais(0))).toBe('R$ 0,00');
  });

  it('formatarReais rejeita não inteiro', () => {
    expect(codigoDoErro(() => formatarReais(10.5))).toBe('VALOR_INVALIDO');
  });
});
