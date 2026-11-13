'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Revelação discreta inspirada no Scroll Reveal do Animata. */
export function RevelarSuave({ children, className = '', atraso = 0 }: { children: ReactNode; className?: string; atraso?: number }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduzir ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduzir ? 0 : 0.55, delay: reduzir ? 0 : atraso, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
