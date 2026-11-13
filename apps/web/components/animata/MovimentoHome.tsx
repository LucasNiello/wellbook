'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

/** Marca discretamente a posição da página, sem bloquear a navegação. */
export function ProgressoRolagem() {
  const reduzir = useReducedMotion();
  const { scrollYProgress } = useScroll();
  if (reduzir) return null;
  return <motion.div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primaria" style={{ scaleX: scrollYProgress }} />;
}

/** Paralaxe leve na foto de abertura, inspirada nos efeitos de imagem do Animata. */
export function FotoHeroAnimada() {
  const referencia = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: referencia, offset: ['start start', 'end start'] });
  const deslocamento = useTransform(scrollYProgress, [0, 1], [0, 24]);

  return <div ref={referencia} className="relative h-[410px] overflow-hidden rounded-t-[44%] lg:h-full lg:min-h-[680px] lg:rounded-l-[45%] lg:rounded-tr-none">
    <motion.div className="absolute inset-0" style={reduzir ? undefined : { y: deslocamento, scale: 1.12 }}>
      <Image src="/imagens/wellbook/fundo-entrada.png" alt="Sala de atendimento iluminada por luz natural" fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover object-center" />
    </motion.div>
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-fundo/20 via-transparent to-transparent" />
  </div>;
}

/** Recorte que se abre conforme a rolagem, adaptado do Aperture Reveal do Animata. */
export function FotoAberturaAnimada() {
  const referencia = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: referencia, offset: ['start end', 'end start'] });
  const recorte = useTransform(scrollYProgress, [0, 0.55, 1], [
    'inset(18% 12% round 40px)',
    'inset(0% 0% round 0px)',
    'inset(0% 0% round 0px)',
  ]);
  const escala = useTransform(scrollYProgress, [0, 0.55, 1], [1.12, 1, 1]);

  return <div ref={referencia} className="relative min-h-80 overflow-hidden bg-superficie-vitrine lg:min-h-[540px]">
    <motion.div className="absolute inset-0" style={reduzir ? undefined : { clipPath: recorte, scale: escala }}>
      <Image src="/imagens/wellbook/recepcao-clinica.png" alt="Recepção acolhedora de uma clínica" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
    </motion.div>
  </div>;
}
