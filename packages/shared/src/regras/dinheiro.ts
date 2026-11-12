/** Formatação de dinheiro (só para a interface). O valor é sempre inteiro em centavos. */
import { ErroRegraNegocio } from '../erros';

/** 22000 → 'R$ 220,00'; -2000 → '-R$ 20,00'; 123456789 → 'R$ 1.234.567,89'. */
export function formatarReais(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new ErroRegraNegocio('VALOR_INVALIDO', 'Valor em centavos precisa ser inteiro.');
  }
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = String(abs % 100).padStart(2, '0');
  return `${negativo ? '-' : ''}R$ ${reais},${cent}`;
}
