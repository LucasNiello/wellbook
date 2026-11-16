import type { ReactNode } from 'react';

export function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-texto">
      {titulo}
      {children}
    </label>
  );
}
