import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  CORES_STATUS,
  LISTA_TEMAS,
  MARCA,
  STATUS_AGENDAMENTO,
  calcularConclusao,
  formatarReais,
  variaveisCss,
} from '@wellbook/shared';

// Página provisória da Fase 1: prova que o web consome o pacote compartilhado.
export default function PaginaInicial() {
  const exemplo = calcularConclusao({
    precosServicos: [15000, 7000],
    ajuste: -2000,
    percentualRepasse: 3000,
  });

  return (
    <main className="mx-auto max-w-3xl p-10">
      <h1 className="text-4xl">{MARCA.nome}</h1>
      <p className="text-texto-suave">{MARCA.slogan}</p>
      <nav className="mt-4 flex gap-4">
        <Link href="/entrar" className="rounded bg-primaria px-4 py-2 text-texto-sobre-primaria">
          Entrar
        </Link>
        <Link href="/cadastro" className="rounded border border-borda px-4 py-2 text-texto">
          Criar conta
        </Link>
      </nav>

      <section className="mt-8">
        <h2 className="text-xl">Exemplo da RN09</h2>
        <p>
          Bruto {formatarReais(exemplo.valorBruto)} · líquido {formatarReais(exemplo.valorLiquido)}{' '}
          · clínica {formatarReais(exemplo.valorClinica)} · profissional{' '}
          {formatarReais(exemplo.valorProfissional)}
        </p>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-4">
        {LISTA_TEMAS.map((tema) => (
          <div
            key={tema.id}
            style={variaveisCss(tema.id) as CSSProperties}
            className="rounded-lg border border-borda bg-fundo p-4 text-texto"
          >
            <p>{tema.nome}</p>
            <span className="mt-2 inline-block rounded bg-primaria px-3 py-1 text-texto-sobre-primaria">
              Agendar
            </span>
          </div>
        ))}
      </section>

      <section className="mt-8 flex gap-2">
        {STATUS_AGENDAMENTO.map((status) => (
          <span
            key={status}
            // Cores de status são fixas (RNF08) e vêm do shared, não do tema.
            style={{ background: CORES_STATUS[status].fundo, color: CORES_STATUS[status].texto }}
            className="rounded px-2 py-1 text-sm"
          >
            {CORES_STATUS[status].rotulo}
          </span>
        ))}
      </section>
    </main>
  );
}
