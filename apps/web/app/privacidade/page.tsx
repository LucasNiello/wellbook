import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { variaveisCss } from '@wellbook/shared';

const secoes = [
  { id: 'dados', nome: 'Quais dados coletamos' },
  { id: 'uso', nome: 'Para que usamos' },
  { id: 'acesso', nome: 'Quem vê seus dados' },
  { id: 'direitos', nome: 'Seus direitos' },
];

/** RNF05 / D22: texto RASCUNHO da equipe; o design não altera seu conteúdo. */
export default function PaginaPrivacidade() {
  return <div style={variaveisCss('onix') as CSSProperties} className="min-h-screen bg-fundo text-texto">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
      <Link href="/" aria-label="Wellbook — início" className="focus-visible:outline-2 focus-visible:outline-primaria"><Image src="/imagens/wellbook/logo-claro.svg" width={205} height={46} alt="Wellbook" className="h-10 w-auto" /></Link>
      <Link href="/" className="text-sm text-texto-suave transition hover:text-texto hover:underline focus-visible:outline-2 focus-visible:outline-primaria">Voltar ao início</Link>
    </header>
    <div className="relative min-h-72 overflow-hidden border-y border-borda/40">
      <Image src="/imagens/wellbook/fundo-privacidade.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-fundo via-fundo/85 to-transparent" />
      <div className="relative mx-auto flex min-h-72 max-w-7xl flex-col justify-center px-6 py-10 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[.27em] text-primaria">Seus dados, com clareza</p>
        <h1 className="mt-4 font-serif text-5xl leading-none sm:text-7xl">Política de privacidade</h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-texto-suave">Entenda quais informações são usadas na sua conta e nos agendamentos.</p>
      </div>
    </div>
    <main className="mx-auto grid max-w-7xl gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[250px_1fr] lg:gap-20">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-primaria">Nesta página</p>
        <nav aria-label="Seções da política" className="mt-5 flex flex-col items-start gap-3 text-sm text-texto-suave">{secoes.map((secao) => <a key={secao.id} href={`#${secao.id}`} className="hover:text-texto hover:underline focus-visible:outline-2 focus-visible:outline-primaria">{secao.nome}</a>)}</nav>
        <p className="mt-8 inline-block rounded-full border border-borda px-3 py-1.5 text-xs text-texto-suave">RASCUNHO — revisar</p>
      </aside>
      <article className="max-w-3xl space-y-10 text-sm leading-8 text-texto-suave">
        <section id="dados" className="scroll-mt-8"><h2 className="mb-4 border-b border-borda/60 pb-3 font-serif text-4xl text-texto">Quais dados coletamos</h2><p>Nome, e-mail e telefone informados no cadastro; os agendamentos que você faz (clínica, profissional, serviços, data e horário); e as observações que você escreve ao agendar.</p></section>
        <section id="uso" className="scroll-mt-8"><h2 className="mb-4 border-b border-borda/60 pb-3 font-serif text-4xl text-texto">Para que usamos</h2><p>Para criar e gerenciar seus agendamentos, avisar sobre confirmações, cancelamentos e lembretes, e permitir que a clínica organize o atendimento.</p></section>
        <section id="acesso" className="scroll-mt-8"><h2 className="mb-4 border-b border-borda/60 pb-3 font-serif text-4xl text-texto">Quem vê seus dados</h2><p>A clínica em que você agendou vê seu nome, telefone e os dados do agendamento. As observações que você escreve são vistas apenas por você e pelo profissional que vai atender você; a administração da clínica não tem acesso a elas.</p></section>
        <section id="direitos" className="scroll-mt-8"><h2 className="mb-4 border-b border-borda/60 pb-3 font-serif text-4xl text-texto">Seus direitos</h2><p>Você pode pedir a exclusão da sua conta. Seus dados pessoais serão anonimizados; os registros financeiros dos atendimentos já realizados permanecem com a clínica, sem identificar você.</p></section>
        <Link href="/" className="inline-flex border-b border-primaria pb-1 font-medium text-primaria hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria">Voltar ao início</Link>
      </article>
    </main>
  </div>;
}
