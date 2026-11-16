/**
 * Conversão do que a pessoa DIGITA (texto) para os inteiros do banco, sem ponto flutuante
 * (achado A2 da Etapa A: "12,345" virava 1235 centavos sem aviso; "1.234,56" virava NaN).
 *
 * Formato aceito (padrão brasileiro):
 * - vírgula é o separador decimal, com no máximo 2 casas: "12,5", "12,50";
 * - ponto é separador de milhar, em grupos de 3: "1.234,56", "1.234";
 * - sem vírgula, um ponto seguido de 1 ou 2 dígitos é lido como decimal: "12.5" → 12,50;
 * - prefixo "R$" e espaços são ignorados; no percentual, o sufixo "%" também.
 * Recusa: mais de 2 casas decimais, sinal negativo, letras, texto vazio e valores enormes.
 */

export type ResultadoConversao =
  | { readonly ok: true; readonly valor: number }
  | { readonly ok: false; readonly mensagem: string };

// Com milhar, o 1º grupo não começa em 0 ("0.250" é recusado em vez de virar R$ 250,00).
const COM_MILHAR = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;
const PONTO_DECIMAL = /^(\d+)\.(\d{1,2})$/;

/** Separa o texto em parte inteira e centésimos (00–99), só com operações de texto e inteiros. */
function lerDecimal(texto: string): { inteiro: number; centesimos: number } | null {
  let inteiro: string;
  let fracao: string;
  const decimal = PONTO_DECIMAL.exec(texto);
  if (decimal) {
    inteiro = decimal[1] ?? '';
    fracao = decimal[2] ?? '';
  } else {
    const m = COM_MILHAR.exec(texto);
    if (!m) return null;
    inteiro = (m[1] ?? '').replace(/\./g, '');
    fracao = m[2] ?? '';
  }
  const n = Number.parseInt(inteiro, 10);
  if (!Number.isSafeInteger(n)) return null;
  return { inteiro: n, centesimos: Number.parseInt(fracao.padEnd(2, '0'), 10) };
}

function limpar(texto: string, removerPercentual: boolean): string {
  let t = texto.replace(/\s+/g, '');
  if (t.startsWith('R$')) t = t.slice(2);
  if (removerPercentual && t.endsWith('%')) t = t.slice(0, -1);
  return t;
}

function motivoRecusa(t: string): string {
  if (t === '') return 'Informe o valor.';
  if (t.startsWith('-')) return 'O valor não pode ser negativo.';
  // Chega aqui só o que não casou com os formatos válidos ("1.234" é milhar e já foi aceito).
  if (/,\d{3,}$/.test(t) || /^\d+\.\d{3,}$/.test(t)) return 'Use no máximo 2 casas decimais.';
  return 'Valor inválido. Use o formato 1.234,56.';
}

/** "R$ 1.234,56" → 123456 centavos. */
export function textoParaCentavos(texto: string): ResultadoConversao {
  const t = limpar(texto, false);
  const lido = lerDecimal(t);
  if (!lido) return { ok: false, mensagem: motivoRecusa(t) };
  const valor = lido.inteiro * 100 + lido.centesimos;
  if (!Number.isSafeInteger(valor)) return { ok: false, mensagem: 'Valor alto demais.' };
  return { ok: true, valor };
}

/** "20%" → 2000 pontos-base; "33,33" → 3333. De 0 a 100,00% (D1). */
export function textoParaPontosBase(texto: string): ResultadoConversao {
  const t = limpar(texto, true);
  const lido = lerDecimal(t);
  if (!lido) return { ok: false, mensagem: motivoRecusa(t) };
  const valor = lido.inteiro * 100 + lido.centesimos;
  if (valor > 10000) return { ok: false, mensagem: 'O percentual vai de 0 a 100%.' };
  return { ok: true, valor };
}

/** 123456 → "1234,56" (valor inicial de campo de formulário; a exibição usa formatarReais). */
export function centavosParaTexto(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** 2000 → "20,00" (valor inicial de campo; a exibição usa formatarPercentual). */
export function pontosBaseParaTexto(pontosBase: number): string {
  return `${Math.floor(pontosBase / 100)},${String(pontosBase % 100).padStart(2, '0')}`;
}
