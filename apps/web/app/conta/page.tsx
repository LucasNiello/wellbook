import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Layers3, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { ROTA_DO_PAPEL, variaveisCss, type Papel } from '@wellbook/shared';
import { criarClienteServidor } from '../../lib/supabase/servidor';
import { carregarPerfil } from '../../lib/perfil';
import { BotaoSair } from '../../components/BotaoSair';
import { BotaoExcluirConta } from '../../components/BotaoExcluirConta';
import { RevelarSuave } from '../../components/animata/RevelarSuave';

const NOME_DO_PAPEL: Readonly<Record<Papel, string>> = {
  super_admin: 'Super Admin',
  admin: 'Administrador(a) da clínica',
  profissional: 'Profissional',
  cliente: 'Cliente',
};

/** Perfil carregado do banco; os campos permanecem somente leitura nesta fase. */
export default async function PaginaConta() {
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');
  const perfil = await carregarPerfil(supabase, user.id);
  if (!perfil) redirect('/entrar');
  const areas = perfil.papeis.filter((papel) => papel !== 'cliente');

  return <div style={variaveisCss('onix') as CSSProperties} className="min-h-screen overflow-x-hidden bg-fundo text-texto">
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 border-b border-borda/60 px-6 py-6 md:px-10">
      <Link href="/" aria-label="Wellbook — início" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primaria">
        <Image src="/imagens/wellbook/logo-claro.svg" width={205} height={46} alt="Wellbook" priority className="h-10 w-auto" />
      </Link>
      <nav aria-label="Navegação da conta" className="flex items-center gap-5 text-xs sm:text-sm">
        <Link href="/" className="text-texto-suave transition hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria">Início</Link>
        <span aria-current="page" className="border-b border-primaria pb-1 text-texto">Minha conta</span>
      </nav>
    </header>

    <main className="mx-auto max-w-7xl px-6 pb-20 pt-14 md:px-10 md:pt-20">
      <RevelarSuave>
        <p className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[.26em] text-primaria"><span className="h-px w-10 bg-primaria"/> Espaço pessoal</p>
        <h1 className="mt-6 font-serif text-[clamp(3.8rem,7vw,7rem)] leading-[.84] tracking-[-.04em]">Minha <em className="text-primaria">conta</em></h1>
        <p className="mt-6 max-w-xl text-sm leading-7 text-texto-suave sm:text-base">Seus dados e as áreas disponíveis para o seu perfil, em um só lugar.</p>
      </RevelarSuave>

      <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <nav aria-label="Seções da conta" className="space-y-2 text-sm">
            <a href="#dados" className="flex min-h-12 items-center gap-3 rounded-xl bg-primaria px-4 font-medium text-texto-sobre-primaria focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria"><UserRound size={18}/> Dados da conta</a>
            <a href="#areas" className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-texto-suave transition hover:bg-superficie hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria"><Layers3 size={18}/> Minhas áreas</a>
            <a href="#privacidade" className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-texto-suave transition hover:bg-superficie hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria"><ShieldCheck size={18}/> Privacidade</a>
          </nav>
          <div className="mt-8 border-t border-borda/60 px-4 pt-7 text-sm"><BotaoSair/></div>
        </aside>

        <div className="min-w-0 space-y-8">
          <RevelarSuave>
            <section id="dados" className="scroll-mt-8 overflow-hidden rounded-[2rem] border border-borda bg-superficie">
              <div className="relative flex min-h-48 items-center gap-5 overflow-hidden border-b border-borda px-6 py-8 sm:gap-7 sm:px-9">
                <Image src="/imagens/wellbook/sala-atendimento.png" alt="" fill sizes="(max-width: 1024px) 100vw, 65vw" className="object-cover opacity-25"/>
                <div className="absolute inset-0 bg-gradient-to-r from-superficie via-superficie/85 to-superficie/35"/>
                <span className="relative grid size-16 shrink-0 place-items-center rounded-full border border-borda bg-fundo text-primaria sm:size-20"><UserRound size={32} strokeWidth={1.3}/></span>
                <div className="relative min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-primaria">Perfil Wellbook</p><h2 className="mt-2 break-words font-serif text-3xl leading-none sm:text-4xl">{perfil.nome}</h2><p className="mt-2 break-all text-sm text-texto-suave">{perfil.email}</p></div>
              </div>
              <div className="grid gap-8 px-6 py-8 sm:grid-cols-2 sm:px-9 sm:py-10">
                <div><p className="flex items-center gap-2 text-xs uppercase tracking-[.16em] text-texto-suave"><UserRound size={16}/> Nome completo</p><p className="mt-3 break-words text-base">{perfil.nome}</p></div>
                <div><p className="flex items-center gap-2 text-xs uppercase tracking-[.16em] text-texto-suave"><Phone size={16}/> Telefone</p><p className="mt-3 text-base">{perfil.telefone || 'Não informado'}</p></div>
                <div className="sm:col-span-2"><p className="flex items-center gap-2 text-xs uppercase tracking-[.16em] text-texto-suave"><Mail size={16}/> E-mail</p><p className="mt-3 break-all text-base">{perfil.email}</p></div>
              </div>
            </section>
          </RevelarSuave>

          <RevelarSuave atraso={0.08}>
            <section id="areas" className="scroll-mt-8 rounded-[2rem] border border-borda bg-superficie p-6 sm:p-9">
              <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-primaria">Acesso</p><h2 className="mt-3 font-serif text-4xl">Minhas áreas</h2>
              <p className="mt-2 text-sm leading-6 text-texto-suave">Acesse os espaços vinculados à sua conta.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {areas.map((papel) => <Link key={papel} href={ROTA_DO_PAPEL[papel]} className="group flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-borda bg-fundo p-5 transition hover:border-primaria focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria"><span><Layers3 size={20} className="mb-2 text-primaria"/><span className="font-medium">{NOME_DO_PAPEL[papel]}</span></span><ArrowUpRight size={18} className="text-primaria transition group-hover:-translate-y-1 group-hover:translate-x-1"/></Link>)}
                {!areas.length && <p className="rounded-2xl border border-borda bg-fundo p-5 text-sm leading-6 text-texto-suave sm:col-span-2">Seu perfil de cliente está ativo. Outras áreas aparecerão aqui quando forem vinculadas à sua conta.</p>}
              </div>
            </section>
          </RevelarSuave>

          <RevelarSuave atraso={0.12}>
            <section id="privacidade" className="scroll-mt-8 rounded-[2rem] border border-borda bg-superficie p-6 sm:p-9">
              <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-primaria">Segurança</p><h2 className="mt-3 font-serif text-4xl">Seus dados, com cuidado.</h2>
              <div className="mt-6 flex flex-wrap gap-5 text-sm"><Link href="/privacidade" className="inline-flex min-h-11 items-center gap-2 text-primaria underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primaria"><ShieldCheck size={18}/> Política de privacidade <ArrowUpRight size={16}/></Link><Link href="/trocar-senha" className="inline-flex min-h-11 items-center gap-2 text-primaria underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primaria"><LockKeyhole size={18}/> Trocar senha <ArrowUpRight size={16}/></Link></div>
              <div className="mt-7 border-t border-borda pt-6 text-sm">{perfil.papeis.length === 1 && perfil.papeis[0] === 'cliente' ? <BotaoExcluirConta/> : <p className="text-texto-suave">Contas de clínica ou de profissional são encerradas pela administração.</p>}</div>
            </section>
          </RevelarSuave>
        </div>
      </div>
    </main>
  </div>;
}
