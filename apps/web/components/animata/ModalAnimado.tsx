'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Adaptação do Modal do Animata: https://animata.design/docs/overlay/modal */
export function ModalAnimado({ aberto, titulo, children, aoFechar }: {
  aberto: boolean; titulo: string; children: ReactNode; aoFechar: () => void;
}) {
  const reduzir = useReducedMotion();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(aoFechar);
  useEffect(() => { fecharRef.current = aoFechar; }, [aoFechar]);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    botaoRef.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharRef.current();
      if (e.key !== 'Tab' || !painelRef.current) return;
      const focaveis = [...painelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      if (!focaveis.length) return;
      if (e.shiftKey && document.activeElement === focaveis[0]) { e.preventDefault(); focaveis.at(-1)?.focus(); }
      if (!e.shiftKey && document.activeElement === focaveis.at(-1)) { e.preventDefault(); focaveis[0]?.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); anterior?.focus(); };
  }, [aberto]);
  return (
    <AnimatePresence>
      {aberto && <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <motion.button type="button" aria-label="Fechar janela" onClick={aoFechar} className="absolute inset-0 bg-texto/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        <motion.div ref={painelRef} role="dialog" aria-modal="true" aria-labelledby="titulo-modal" initial={reduzir ? false : { opacity: 0, y: 22, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 12, scale: .98 }} transition={{ duration: reduzir ? 0 : .24 }} className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-borda bg-superficie p-7 text-texto shadow-2xl">
          <div className="mb-6 flex items-center justify-between gap-4"><h2 id="titulo-modal" className="font-serif text-3xl">{titulo}</h2><button ref={botaoRef} type="button" onClick={aoFechar} className="rounded-full border border-borda px-3 py-1 text-xl focus-visible:outline-2 focus-visible:outline-primaria" aria-label="Fechar">×</button></div>
          {children}
        </motion.div>
      </div>}
    </AnimatePresence>
  );
}
