/**
 * Valores da conclusão do atendimento (RN07–RN10, D1–D4).
 * Tudo em centavos (inteiros) e percentual em pontos-base (inteiro de 0 a 10000).
 * A mesma regra existe na RPC `concluir_atendimento` (supabase/migrations).
 */
import { ErroRegraNegocio } from '../erros';

/** 10000 pontos-base = 100%. */
export const PONTOS_BASE_TOTAL = 10_000;

export interface DivisaoRepasse {
  /** Parte da clínica, arredondada ao centavo (meio para cima — D2). */
  valorClinica: number;
  /** O restante, para a soma fechar com o líquido. */
  valorProfissional: number;
}

export interface ResultadoConclusao extends DivisaoRepasse {
  valorBruto: number;
  ajuste: number;
  valorLiquido: number;
  percentualRepasse: number;
}

function exigirInteiro(valor: number, nome: string): void {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroRegraNegocio('VALOR_INVALIDO', `${nome} precisa ser um inteiro em centavos.`);
  }
}

/** Valor bruto = soma dos preços atuais dos serviços (RN07, D4). */
export function calcularValorBruto(precosCentavos: readonly number[]): number {
  let total = 0;
  for (const preco of precosCentavos) {
    exigirInteiro(preco, 'Preço');
    if (preco < 0) throw new ErroRegraNegocio('VALOR_INVALIDO', 'Preço não pode ser negativo.');
    total += preco;
  }
  return total;
}

/** Líquido = bruto + ajuste (ajuste negativo = desconto). Nunca negativo (D3). */
export function calcularValorLiquido(valorBruto: number, ajuste: number): number {
  exigirInteiro(valorBruto, 'Valor bruto');
  exigirInteiro(ajuste, 'Ajuste');
  if (valorBruto < 0) {
    throw new ErroRegraNegocio('VALOR_INVALIDO', 'Valor bruto não pode ser negativo.');
  }
  const liquido = valorBruto + ajuste;
  if (liquido < 0) {
    throw new ErroRegraNegocio(
      'LIQUIDO_NEGATIVO',
      'O desconto não pode ser maior que o valor bruto.',
    );
  }
  return liquido;
}

/** D1: inteiro entre 0 e 10000. */
export function validarPercentual(percentualPontosBase: number): void {
  if (
    !Number.isSafeInteger(percentualPontosBase) ||
    percentualPontosBase < 0 ||
    percentualPontosBase > PONTOS_BASE_TOTAL
  ) {
    throw new ErroRegraNegocio(
      'PERCENTUAL_INVALIDO',
      'O percentual de repasse deve ser um inteiro entre 0 e 10000 pontos-base.',
    );
  }
}

/**
 * Repasse (RN09): clínica = líquido × percentual, arredondado ao centavo meio para cima (D2);
 * o profissional fica com o restante. Só aritmética inteira (BigInt evita estouro).
 */
export function calcularDivisao(valorLiquido: number, percentualPontosBase: number): DivisaoRepasse {
  exigirInteiro(valorLiquido, 'Valor líquido');
  if (valorLiquido < 0) {
    throw new ErroRegraNegocio('LIQUIDO_NEGATIVO', 'Valor líquido não pode ser negativo.');
  }
  validarPercentual(percentualPontosBase);
  // (liquido × pb + 5000) div 10000 = arredondamento meio para cima, sem ponto flutuante.
  const clinica = Number(
    (BigInt(valorLiquido) * BigInt(percentualPontosBase) + BigInt(PONTOS_BASE_TOTAL / 2)) /
      BigInt(PONTOS_BASE_TOTAL),
  );
  return { valorClinica: clinica, valorProfissional: valorLiquido - clinica };
}

/** Cálculo completo gravado em `conclusoes` (RN07–RN10). */
export function calcularConclusao(entrada: {
  precosServicos: readonly number[];
  ajuste: number;
  percentualRepasse: number;
}): ResultadoConclusao {
  const valorBruto = calcularValorBruto(entrada.precosServicos);
  const valorLiquido = calcularValorLiquido(valorBruto, entrada.ajuste);
  const divisao = calcularDivisao(valorLiquido, entrada.percentualRepasse);
  return {
    valorBruto,
    ajuste: entrada.ajuste,
    valorLiquido,
    percentualRepasse: entrada.percentualRepasse,
    ...divisao,
  };
}

/** Pontos-base → texto '30,00%' (só para a interface). */
export function formatarPercentual(percentualPontosBase: number): string {
  validarPercentual(percentualPontosBase);
  const inteiro = Math.floor(percentualPontosBase / 100);
  const decimal = String(percentualPontosBase % 100).padStart(2, '0');
  return `${inteiro},${decimal}%`;
}
