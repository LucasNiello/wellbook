import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { MARCA, TEMA_PADRAO, variaveisCss } from '@wellbook/shared';
import './globals.css';

export const metadata: Metadata = {
  title: MARCA.nome,
  description: 'Agendamento e gestão para clínicas de estética e saúde mental.',
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" style={variaveisCss(TEMA_PADRAO) as CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
