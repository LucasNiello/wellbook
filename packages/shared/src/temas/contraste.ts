/** Contraste WCAG 2.x (RNF07). */

const RE_HEX = /^#[0-9a-fA-F]{6}$/;

function canalLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa de uma cor '#RRGGBB'. */
export function luminancia(hex: string): number {
  if (!RE_HEX.test(hex)) throw new Error(`Cor inválida: ${hex}`);
  const r = canalLinear(parseInt(hex.slice(1, 3), 16));
  const g = canalLinear(parseInt(hex.slice(3, 5), 16));
  const b = canalLinear(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores (1 a 21). */
export function razaoContraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

/** WCAG AA para texto normal. */
export const CONTRASTE_MINIMO_TEXTO = 4.5;
/** WCAG AA para componentes de interface e elementos gráficos (1.4.11). */
export const CONTRASTE_MINIMO_COMPONENTE = 3;
