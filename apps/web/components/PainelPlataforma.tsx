'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Building2, Search } from 'lucide-react';
import { traduzirErroBanco } from '@wellbook/shared';
import { criarClienteNavegador } from '../lib/supabase/navegador';
import { BotaoSair } from './BotaoSair';
import { BordaAnimada } from './animata/BordaAnimada';

type Clinica = { id: string; nome: string; slug: string; tema: string; ativo: boolean; criado_em: string };

/**
 * Painel do Super Admin.
 * D29: as empresas se cadastram sozinhas; o Super Admin só ativa ou desativa (D23).
 * D43: o Super Admin não cria nem remove admins. D40: o link (slug) é imutável.
 */
export function PainelPlataforma({ clinicasIniciais }: { clinicasIniciais: Clinica[] }) {
  const [clinicas, setClinicas] = useState(clinicasIniciais);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const reduzir = useReducedMotion();
  const supabase = useMemo(criarClienteNavegador, []);
  const exibidas = clinicas.filter((c) => `${c.nome} ${c.slug}`.toLowerCase().includes(busca.toLowerCase()));

  async function alternar(clinica: Clinica) {
    setOcupado(true);
    setMensagem('');
    const { error } = await supabase.from('tenants').update({ ativo: !clinica.ativo }).eq('id', clinica.id);
    if (error) setMensagem(traduzirErroBanco(error));
    else {
      setClinicas((atual) => atual.map((c) => (c.id === clinica.id ? { ...c, ativo: !c.ativo } : c)));
      setMensagem(
        clinica.ativo ? 'Clínica desativada. Os agendamentos existentes foram mantidos.' : 'Clínica reativada.',
      );
    }
    setOcupado(false);
  }

  return (
    <div className="min-h-screen bg-fundo text-texto">
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-6 md:px-10">
        <header className="flex items-center justify-between border-b border-borda pb-6">
          <div className="flex items-center gap-3">
            <Image src="/imagens/wellbook/logo-escuro.svg" width={170} height={42} alt="Wellbook" priority className="h-10 w-auto" />
            <span className="border-l border-borda pl-3 text-[10px] font-semibold uppercase tracking-[.2em] text-texto-suave">
              Plataforma
            </span>
          </div>
          <BotaoSair />
        </header>

        <div className="mb-8 mt-10">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primaria">Gestão da plataforma</p>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl">
            Clínicas<span className="text-primaria">.</span>
          </h1>
          <p className="mt-3 text-sm text-texto-suave">
            As empresas se cadastram sozinhas. Aqui você ativa ou desativa cada espaço.
          </p>
        </div>

        <BordaAnimada>
          <div className="flex flex-wrap items-center justify-between gap-6 p-7 md:p-9">
            <div>
              <p className="text-xs uppercase tracking-widest text-primaria">Ecossistema Wellbook</p>
              <h2 className="mt-3 font-serif text-3xl">Cada clínica, uma identidade.</h2>
              <p className="mt-2 text-sm text-texto-suave">Administre os espaços sem acessar os dados de atendimento.</p>
            </div>
            <div className="flex gap-7">
              <div>
                <strong className="font-serif text-4xl">{clinicas.length.toString().padStart(2, '0')}</strong>
                <p className="text-xs text-texto-suave">Clínicas</p>
              </div>
              <div>
                <strong className="font-serif text-4xl">
                  {clinicas.filter((c) => c.ativo).length.toString().padStart(2, '0')}
                </strong>
                <p className="text-xs text-texto-suave">Ativas</p>
              </div>
            </div>
          </div>
        </BordaAnimada>

        {mensagem && (
          <p role="status" className="mt-6 rounded-xl border border-borda bg-superficie-vitrine p-4 text-sm">
            {mensagem}
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif text-3xl">Todos os espaços</h2>
          <label className="flex items-center gap-2 rounded-xl border border-borda bg-superficie px-4 py-2">
            <Search size={17} className="text-texto-suave" />
            <span className="sr-only">Buscar clínica</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar clínica"
              className="min-h-8 bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {exibidas.map((c) => (
            <motion.article
              key={c.id}
              whileHover={reduzir ? undefined : { y: -4 }}
              className="rounded-3xl border border-borda bg-superficie p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-2xl bg-superficie-vitrine text-primaria">
                  <Building2 size={22} />
                </span>
                <span className="rounded-full border border-borda px-3 py-1 text-xs text-texto-suave">
                  {c.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <h3 className="mt-7 font-serif text-3xl">{c.nome}</h3>
              <p className="mt-1 text-sm text-texto-suave">
                /{c.slug} · Tema {c.tema}
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-borda pt-5">
                <span className="text-xs text-texto-suave">
                  Desde {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                </span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void alternar(c)}
                  className="flex items-center gap-1 text-sm font-medium text-primaria hover:underline"
                >
                  {c.ativo ? 'Desativar' : 'Reativar'} <ArrowRight size={15} />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
        {!exibidas.length && (
          <div className="mt-5 rounded-3xl border border-dashed border-borda p-12 text-center text-sm text-texto-suave">
            Nenhuma clínica encontrada.
          </div>
        )}
      </div>
    </div>
  );
}
