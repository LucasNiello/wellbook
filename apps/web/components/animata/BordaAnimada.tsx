import type { ReactNode } from 'react';

/** Adaptação de Animated Border Trail: https://animata.design/docs/container/animated-border-trail */
export function BordaAnimada({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`borda-animata relative overflow-hidden rounded-[28px] p-px ${className}`}>
      <div className="borda-animata-trilha pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative h-full rounded-[27px] bg-superficie">{children}</div>
    </div>
  );
}
