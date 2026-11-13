'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Adaptação de Fluid Tabs: https://animata.design/docs/tabs/fluid-tabs */
export function AbasFluidas<T extends string>({ itens, valor, aoMudar }: {
  itens: readonly { id: T; rotulo: string; icone: ReactNode }[];
  valor: T;
  aoMudar: (valor: T) => void;
}) {
  const reduzir = useReducedMotion();
  return (
    <nav aria-label="Seções do painel" className="flex flex-wrap gap-1 rounded-2xl border border-borda bg-superficie p-1.5 shadow-sm">
      {itens.map((item) => (
        <button key={item.id} type="button" onClick={() => aoMudar(item.id)} aria-current={valor === item.id ? 'page' : undefined}
          className={`relative flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria ${valor === item.id ? 'text-texto-sobre-primaria' : 'text-texto-suave hover:text-texto'}`}>
          {valor === item.id && <motion.span layoutId="aba-fluida" transition={reduzir ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-xl bg-primaria shadow-sm" aria-hidden="true" />}
          <span className="relative z-10 flex items-center gap-2">{item.icone}{item.rotulo}</span>
        </button>
      ))}
    </nav>
  );
}
