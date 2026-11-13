import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, CalendarDays, HeartHandshake, Sparkles } from 'lucide-react';
import { variaveisCss } from '@wellbook/shared';
import { BordaAnimada } from '../components/animata/BordaAnimada';
import { BlurryBlob } from '../components/animata/BlurryBlob';
import { FotoAberturaAnimada, FotoHeroAnimada, ProgressoRolagem } from '../components/animata/MovimentoHome';
import { RevelarSuave } from '../components/animata/RevelarSuave';

const passos = [
  { numero: '01', titulo: 'Escolha com calma', texto: 'Conheça a clínica, os profissionais e os serviços em um só lugar.', icone: HeartHandshake },
  { numero: '02', titulo: 'Encontre seu horário', texto: 'Veja a disponibilidade de quem vai atender você.', icone: CalendarDays },
  { numero: '03', titulo: 'Cuide do seu tempo', texto: 'Acompanhe seus agendamentos pela sua conta.', icone: Sparkles },
];

export default function PaginaInicial() {
  return (
    <div style={variaveisCss('onix') as CSSProperties} className="min-h-screen bg-fundo text-texto">
      <ProgressoRolagem />
      <header className="relative z-20 border-b border-borda/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Wellbook — início" className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primaria">
            <Image src="/imagens/wellbook/logo-claro.svg" width={205} height={46} alt="Wellbook" priority className="h-10 w-auto" />
          </Link>
          <nav aria-label="Navegação principal" className="flex items-center gap-4 text-sm sm:gap-8">
            <a href="#experiencia" className="hidden text-texto-suave transition hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria sm:block">A experiência</a>
            <Link href="/entrar" className="text-texto-suave transition hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria">Entrar</Link>
            <Link href="/cadastro" className="botao-animata-brilho rounded-full border border-primaria px-4 py-2 text-texto transition hover:bg-primaria hover:text-texto-sobre-primaria focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria sm:px-6">Criar conta</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid min-h-[680px] max-w-[1600px] items-center overflow-hidden lg:grid-cols-[.92fr_1.08fr]">
          <BlurryBlob />
          <div className="relative z-10 px-6 py-20 sm:px-10 lg:px-16 lg:py-24 xl:pl-24">
            <RevelarSuave>
              <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[.28em] text-primaria"><span className="h-px w-12 bg-primaria" /> Bem-vindo ao Wellbook</p>
              <h1 className="mt-9 max-w-2xl font-serif text-[clamp(3.6rem,6.7vw,7rem)] leading-[.86] tracking-[-.045em]">
                Seu cuidado,<br /><em className="font-normal text-primaria">no tempo certo.</em>
              </h1>
              <p className="mt-9 max-w-md text-base leading-8 text-texto-suave">Um espaço para descobrir clínicas, conhecer profissionais e organizar seus agendamentos com tranquilidade.</p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <BordaAnimada className="rounded-2xl" >
                  <Link href="/cadastro" className="botao-animata-brilho relative flex min-h-14 items-center gap-8 rounded-[27px] bg-primaria px-7 font-medium text-texto-sobre-primaria transition hover:bg-primaria-pressionada focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria">Criar minha conta <ArrowRight size={18} /></Link>
                </BordaAnimada>
                <Link href="/entrar" className="link-animata-seta inline-flex min-h-14 items-center rounded-xl px-5 text-sm text-texto underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primaria">Já tenho uma conta <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </RevelarSuave>
          </div>
          <FotoHeroAnimada />
        </section>

        <section id="experiencia" style={variaveisCss('salvia') as CSSProperties} className="bg-fundo px-6 py-24 text-texto sm:px-10 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <RevelarSuave className="grid items-end gap-8 lg:grid-cols-[1fr_.65fr]">
              <div><p className="text-xs font-semibold uppercase tracking-[.28em] text-primaria">Uma experiência mais simples</p><h2 className="mt-5 max-w-3xl font-serif text-5xl leading-[.95] tracking-tight sm:text-7xl">Mais espaço para o que importa: você.</h2></div>
              <p className="max-w-sm text-sm leading-7 text-texto-suave">O Wellbook aproxima pessoas e clínicas em uma jornada de cuidado clara, do primeiro contato ao atendimento.</p>
            </RevelarSuave>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {passos.map((passo, indice) => <RevelarSuave key={passo.numero} atraso={indice * .08} className="group rounded-[28px] border border-borda bg-superficie p-7 transition-shadow hover:shadow-xl">
                <div className="flex items-start justify-between"><span className="text-xs tracking-[.2em] text-texto-suave">{passo.numero} / 03</span><passo.icone size={24} strokeWidth={1.35} className="text-primaria" /></div>
                <h3 className="mt-16 font-serif text-3xl">{passo.titulo}</h3><p className="mt-3 max-w-xs text-sm leading-7 text-texto-suave">{passo.texto}</p>
              </RevelarSuave>)}
            </div>
          </div>
        </section>

        <section className="grid min-h-[540px] lg:grid-cols-2">
          <FotoAberturaAnimada />
          <div className="flex items-center bg-fundo px-8 py-20 sm:px-14"><RevelarSuave className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.25em] text-primaria">Para clínicas e pessoas</p><h2 className="mt-5 font-serif text-5xl leading-none sm:text-6xl">Cada encontro merece atenção.</h2><p className="mt-6 text-sm leading-7 text-texto-suave">Uma identidade própria para cada clínica e uma conta única para você acompanhar sua jornada.</p><Link href="/cadastro" className="link-animata-seta mt-8 inline-flex items-center gap-3 border-b border-primaria pb-2 text-sm font-medium text-primaria focus-visible:outline-2 focus-visible:outline-primaria">Começar agora <ArrowRight size={17} /></Link></RevelarSuave></div>
        </section>
      </main>
      <footer className="border-t border-borda/50 px-6 py-8 text-xs text-texto-suave sm:px-10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><span>© Wellbook · Cuidado em cada encontro</span><Link href="/privacidade" className="hover:text-texto hover:underline">Política de privacidade</Link></div></footer>
    </div>
  );
}
