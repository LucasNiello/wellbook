'use client';

import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { LISTA_TEMAS, variaveisCss } from '@wellbook/shared';
import { usePainel } from './ContextoPainel';
import { TituloSecao } from './Secao';
import { botao } from './estilos';

export function SeletorTema() {
  const { dados, tenantId, supabase, ocupado, executar, erro, setDados, temaPreview, setTemaPreview } = usePainel();

  async function salvarTema() {
    await executar(async () => {
      const { data, error } = await supabase.from('tenants').update({ tema: temaPreview }).eq('id', tenantId).select('tema').single();
      erro(error);
      if (!data) throw new Error('Não foi possível confirmar o tema salvo.');
      setDados((atual) => ({ ...atual, clinica: { ...atual.clinica, tema: data.tema } }));
    }, 'Tema aplicado à clínica.');
  }

  return (
    <div className="rounded-3xl border border-borda bg-superficie p-7">
      <TituloSecao etiqueta="Estilo da clínica" titulo="Tema visual" descricao="Escolha um dos oito temas. Veja a prévia antes de aplicar." />
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LISTA_TEMAS.map((tema) => (
          <button
            key={tema.id}
            type="button"
            onClick={() => setTemaPreview(tema.id)}
            aria-pressed={temaPreview === tema.id}
            className={`rounded-xl border bg-fundo p-3 text-left text-xs text-texto transition hover:-translate-y-1 ${temaPreview === tema.id ? 'border-primaria ring-2 ring-primaria/20' : 'border-borda'}`}
            style={variaveisCss(tema.id) as CSSProperties}
          >
            <span className="block h-10 rounded-lg bg-fundo p-2 text-primaria">
              <span className="block size-5 rounded-full bg-primaria" />
            </span>
            <span className="mt-2 block text-texto">{tema.nome}</span>
          </button>
        ))}
      </div>
      <div style={variaveisCss(temaPreview) as CSSProperties} className="mt-5 rounded-2xl border border-borda bg-fundo p-5 text-texto">
        <p className="text-xs uppercase tracking-widest text-texto-suave">Prévia ao vivo</p>
        <p className="mt-3 font-serif text-2xl">{dados.clinica.nome}</p>
        <button type="button" className="mt-4 rounded-lg bg-primaria px-4 py-2 text-sm text-texto-sobre-primaria">
          Agendar horário
        </button>
      </div>
      <button
        type="button"
        disabled={ocupado || temaPreview === dados.clinica.tema}
        onClick={() => void salvarTema()}
        className={`${botao} mt-5`}
      >
        Aplicar tema <Check size={16} />
      </button>
    </div>
  );
}
