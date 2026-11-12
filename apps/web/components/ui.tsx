/**
 * Peças de formulário das telas de autenticação. Só tokens de tema (bg-primaria, text-texto…),
 * nenhuma cor hex.
 */
import Link from 'next/link';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function CartaoAuth({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-borda bg-superficie p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-texto">{titulo}</h1>
        {children}
        {rodape ? <div className="mt-6 space-y-2 text-sm text-texto-suave">{rodape}</div> : null}
      </div>
    </main>
  );
}

export function Campo({
  rotulo,
  id,
  ...props
}: { rotulo: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-texto">
        {rotulo}
      </label>
      <input
        id={id}
        name={id}
        className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto outline-none focus:border-primaria"
        {...props}
      />
    </div>
  );
}

export function BotaoPrimario({ children, carregando }: { children: ReactNode; carregando?: boolean }) {
  return (
    <button
      type="submit"
      disabled={carregando}
      className="w-full rounded-lg bg-primaria px-4 py-2 font-medium text-texto-sobre-primaria hover:bg-primaria-pressionada disabled:opacity-60"
    >
      {carregando ? 'Aguarde…' : children}
    </button>
  );
}

/** Mensagem de erro ou de sucesso do formulário (lida por leitores de tela). */
export function Aviso({ texto, tipo = 'erro' }: { texto: string | null; tipo?: 'erro' | 'ok' }) {
  if (!texto) return null;
  return (
    <p
      role={tipo === 'erro' ? 'alert' : 'status'}
      className="mb-4 rounded-lg border border-borda bg-superficie-vitrine px-3 py-2 text-sm text-texto"
    >
      {tipo === 'erro' ? '⚠ ' : '✓ '}
      {texto}
    </p>
  );
}

/** §7.1: Google e Apple aparecem desabilitados, marcados "Em desenvolvimento" (RF03/RF04 adiados). */
export function BotoesSociais() {
  return (
    <div className="mt-6 space-y-2">
      {['Google', 'Apple'].map((provedor) => (
        <button
          key={provedor}
          type="button"
          disabled
          aria-disabled="true"
          className="flex w-full cursor-not-allowed items-center justify-between rounded-lg border border-borda px-4 py-2 text-texto-suave opacity-70"
        >
          <span>Entrar com {provedor}</span>
          <span className="rounded-full border border-borda px-2 text-xs">Em desenvolvimento</span>
        </button>
      ))}
    </div>
  );
}

export function LinkTexto({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-primaria underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
