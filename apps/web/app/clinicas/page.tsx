import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Building2, Search } from 'lucide-react';
import { variaveisCss } from '@wellbook/shared';
import { criarClienteServidor } from '../../lib/supabase/servidor';

type ClinicaVitrine = { id: string; nome: string; slug: string; logo_url: string | null };

/** Escapa os curingas do ILIKE para a busca digitada valer como texto literal. */
function escaparBusca(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * D21/D42: lista das clínicas ATIVAS com busca por nome — destino do cliente depois do login.
 * Pública e só leitura (política tenants_vitrine). A vitrine /[slug] e o agendamento chegam na
 * Etapa C (Fase 5).
 */
export default async function PaginaClinicas({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca: buscaBruta } = await searchParams;
  const busca = (buscaBruta ?? '').trim().slice(0, 80);
  const supabase = await criarClienteServidor();
  let consulta = supabase.from('tenants').select('id,nome,slug,logo_url').eq('ativo', true).order('nome');
  if (busca) consulta = consulta.ilike('nome', `%${escaparBusca(busca)}%`);
  const { data, error } = await consulta.limit(200);
  const clinicas: ClinicaVitrine[] = data ?? [];

  return (
    <div style={variaveisCss('onix') as CSSProperties} className="min-h-screen overflow-x-hidden bg-fundo text-texto">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 border-b border-borda/60 px-6 py-6 md:px-10">
        <Link href="/" aria-label="Wellbook — início" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primaria">
          <Image src="/imagens/wellbook/logo-claro.svg" width={205} height={46} alt="Wellbook" priority className="h-10 w-auto" />
        </Link>
        <nav aria-label="Navegação" className="flex items-center gap-5 text-xs sm:text-sm">
          <span aria-current="page" className="border-b border-primaria pb-1 text-texto">Clínicas</span>
          <Link href="/conta" className="text-texto-suave transition hover:text-texto focus-visible:outline-2 focus-visible:outline-primaria">
            Minha conta
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-14 md:px-10">
        <p className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[.26em] text-primaria">
          <span className="h-px w-10 bg-primaria" /> Encontre seu espaço
        </p>
        <h1 className="mt-6 font-serif text-[clamp(3rem,6vw,5.5rem)] leading-[.9] tracking-[-.03em]">
          Clínicas <em className="text-primaria">Wellbook</em>
        </h1>

        <form action="/clinicas" method="get" role="search" className="mt-10 flex max-w-xl items-center gap-2 rounded-2xl border border-borda bg-superficie px-4 py-2">
          <Search size={18} className="text-texto-suave" aria-hidden="true" />
          <label htmlFor="busca" className="sr-only">Buscar clínica pelo nome</label>
          <input
            id="busca"
            name="busca"
            defaultValue={busca}
            maxLength={80}
            placeholder="Buscar clínica pelo nome"
            className="min-h-10 flex-1 bg-transparent text-sm outline-none"
          />
          <button type="submit" className="min-h-10 rounded-xl bg-primaria px-4 text-sm font-semibold text-texto-sobre-primaria">
            Buscar
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-8 rounded-2xl border border-borda bg-superficie p-5 text-sm">
            Não foi possível carregar as clínicas agora. Tente de novo em instantes.
          </p>
        )}

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clinicas.map((c) => (
            <li key={c.id} className="rounded-3xl border border-borda bg-superficie p-6">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-superficie-vitrine text-primaria">
                  {c.logo_url ? <img src={c.logo_url} alt="" className="size-full object-cover" /> : <Building2 size={24} />}
                </span>
                <div className="min-w-0">
                  <h2 className="break-words font-serif text-2xl leading-tight">{c.nome}</h2>
                  <p className="text-xs text-texto-suave">/{c.slug}</p>
                </div>
              </div>
              <p className="mt-5 text-xs text-texto-suave">Agendamento online em breve.</p>
            </li>
          ))}
        </ul>
        {!error && !clinicas.length && (
          <p className="mt-10 rounded-3xl border border-dashed border-borda p-12 text-center text-sm text-texto-suave">
            {busca ? `Nenhuma clínica ativa encontrada para "${busca}".` : 'Nenhuma clínica ativa no momento.'}
          </p>
        )}
      </main>
    </div>
  );
}
