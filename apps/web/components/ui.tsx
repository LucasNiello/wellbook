import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { variaveisCss } from '@wellbook/shared';
import { BordaAnimada } from './animata/BordaAnimada';
import { RevelarSuave } from './animata/RevelarSuave';

/** Base visual das telas de autenticação; os formulários preservam seus próprios fluxos. */
export function CartaoAuth({ titulo, descricao, children, rodape }: { titulo: string; descricao?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div style={variaveisCss('onix') as CSSProperties} className="grid min-h-screen bg-fundo text-texto lg:grid-cols-[1fr_1fr]">
      <main className="flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-16 xl:px-24">
        <header className="flex items-center justify-between gap-5">
          <Link href="/" aria-label="Wellbook — início" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primaria">
            <Image src="/imagens/wellbook/logo-claro.svg" width={205} height={46} alt="Wellbook" priority className="h-10 w-auto" />
          </Link>
          <Link href="/" className="text-xs text-texto-suave transition hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria">Início</Link>
        </header>
        <RevelarSuave className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-16">
          <p className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[.26em] text-primaria"><span className="h-px w-10 bg-primaria" /> Sua experiência Wellbook</p>
          <h1 className="mb-4 mt-7 font-serif text-[clamp(3.5rem,5vw,5.5rem)] leading-[.88] tracking-[-.04em]">{titulo}</h1>
          {descricao && <p className="mb-8 max-w-md text-sm leading-7 text-texto-suave">{descricao}</p>}
          <div className={descricao ? '' : 'mt-7'}>{children}</div>
          {rodape && <div className="mt-7 space-y-2 border-t border-borda/60 pt-6 text-sm text-texto-suave">{rodape}</div>}
        </RevelarSuave>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-borda/50 pt-5 text-xs text-texto-suave"><span>Wellbook · Cuidado em cada encontro</span><Link href="/privacidade" className="hover:text-texto hover:underline">Privacidade</Link></footer>
      </main>
      <aside className="relative hidden min-h-screen overflow-hidden lg:block" aria-hidden="true">
        <Image src="/imagens/wellbook/fundo-entrada.png" alt="" fill priority sizes="50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-fundo/70 via-transparent to-transparent" />
        <p className="absolute bottom-12 left-12 max-w-sm font-serif text-4xl leading-none text-texto drop-shadow-lg xl:left-20">Seu tempo merece cuidado.</p>
      </aside>
    </div>
  );
}

export function Campo({ rotulo, id, ...props }: { rotulo: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-texto">{rotulo}</label>
      <input id={id} name={id} className="min-h-12 w-full rounded-xl border border-borda bg-superficie px-4 py-3 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-2 focus:ring-primaria/25" {...props} />
    </div>
  );
}

export function BotaoPrimario({ children, carregando }: { children: ReactNode; carregando?: boolean }) {
  return (
    <BordaAnimada className="w-full">
      <button type="submit" disabled={carregando} className="relative flex min-h-14 w-full items-center justify-center gap-3 rounded-[27px] bg-primaria px-5 py-3 text-sm font-semibold text-texto-sobre-primaria transition hover:bg-primaria-pressionada focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria disabled:opacity-60">
        {carregando ? 'Aguarde…' : children}{!carregando && <ArrowRight size={17} aria-hidden="true" />}
      </button>
    </BordaAnimada>
  );
}

/** Mensagem de formulário anunciada a leitores de tela. */
export function Aviso({ texto, tipo = 'erro' }: { texto: string | null; tipo?: 'erro' | 'ok' }) {
  if (!texto) return null;
  return <p role={tipo === 'erro' ? 'alert' : 'status'} className="mb-5 rounded-xl border border-borda bg-superficie-vitrine px-4 py-3 text-sm leading-6 text-texto">{tipo === 'erro' ? '⚠ ' : '✓ '}{texto}</p>;
}

/** Google e Apple permanecem indisponíveis nesta fase. */
export function BotoesSociais() {
  return <div className="mt-7 space-y-2 border-t border-borda/50 pt-6">
    {['Google', 'Apple'].map((provedor) => <button key={provedor} type="button" disabled aria-disabled="true" className="flex min-h-11 w-full cursor-not-allowed items-center justify-between rounded-xl border border-borda bg-superficie px-4 text-sm text-texto-suave opacity-70"><span>Entrar com {provedor}</span><span className="rounded-full border border-borda px-2 py-1 text-[10px]">Em desenvolvimento</span></button>)}
  </div>;
}

export function LinkTexto({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-medium text-primaria underline-offset-4 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria">{children}</Link>;
}
