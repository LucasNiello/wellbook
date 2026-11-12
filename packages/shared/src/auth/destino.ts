/**
 * Destino interno seguro para `?proxima=` e callbacks: evita redirecionamento aberto.
 * Aceita só caminhos relativos da própria origem (recusa `//x`, `/\x`, esquemas e caracteres de controle).
 */
export function destinoSeguro(proxima: string | null | undefined, padrao = '/conta'): string {
  if (!proxima || !proxima.startsWith('/')) return padrao;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(proxima) || proxima.startsWith('//')) return padrao;
  const base = 'http://wellbook.local';
  try {
    const url = new URL(proxima, base);
    if (url.origin !== base) return padrao;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return padrao;
  }
}
