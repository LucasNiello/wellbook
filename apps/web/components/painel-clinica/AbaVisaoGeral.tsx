'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CalendarDays, ChevronRight, Heart, Users } from 'lucide-react';
import { BordaAnimada } from '../animata/BordaAnimada';
import { usePainel } from './ContextoPainel';
import { botao } from './estilos';
import type { Aba } from './tipos';

export function AbaVisaoGeral() {
  const { dados, mudarAba } = usePainel();
  const reduzir = useReducedMotion();
  const ativos = dados.profissionais.filter((p) => p.ativo);
  const servicosAtivos = dados.servicos.filter((s) => s.ativo);
  const futuros = dados.agendamentos.filter((a) => a.status === 'AGENDADO' && new Date(a.inicio).getTime() > Date.now());
  const proximos = [...futuros].sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 4);
  const cartoes = [
    { rotulo: 'Profissionais ativos', valor: ativos.length, icone: <Users size={20} />, destino: 'equipe' as Aba },
    { rotulo: 'Serviços disponíveis', valor: servicosAtivos.length, icone: <Heart size={20} />, destino: 'servicos' as Aba },
    { rotulo: 'Próximos atendimentos', valor: futuros.length, icone: <CalendarDays size={20} />, destino: 'agenda' as Aba },
  ];

  return (
    <>
      <BordaAnimada className="mb-7">
        <div className="grid gap-7 p-7 md:grid-cols-[1.3fr_.7fr] md:p-10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-primaria">Bem-vindo ao seu espaço</span>
            <h2 className="mt-4 max-w-xl font-serif text-4xl leading-tight md:text-5xl">Uma experiência à altura da sua clínica.</h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-texto-suave">
              Organize sua equipe, personalize a identidade e mantenha cada serviço em perfeita harmonia.
            </p>
            <button type="button" onClick={() => mudarAba('clinica')} className={`${botao} mt-7`}>
              Personalizar clínica <ArrowRight size={16} />
            </button>
          </div>
          <div className="relative min-h-64 overflow-hidden rounded-3xl bg-superficie-vitrine">
            <Image
              src="/imagens/wellbook/recepcao-clinica.png"
              alt="Recepção acolhedora de uma clínica"
              fill
              sizes="(max-width: 768px) 100vw, 35vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-fundo/85 via-transparent to-transparent" />
            <p className="absolute bottom-6 left-6 max-w-48 font-serif text-3xl leading-none text-texto">
              Cuidado em
              <br />
              cada detalhe.
            </p>
          </div>
        </div>
      </BordaAnimada>
      <div className="grid gap-4 md:grid-cols-3">
        {cartoes.map((item, i) => (
          <motion.button
            key={item.rotulo}
            type="button"
            onClick={() => mudarAba(item.destino)}
            whileHover={reduzir ? undefined : { y: -5 }}
            transition={{ delay: reduzir ? 0 : i * 0.06 }}
            className="group rounded-3xl border border-borda bg-superficie p-6 text-left shadow-sm transition hover:shadow-lg"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-superficie-vitrine text-primaria">{item.icone}</span>
            <p className="mt-8 font-serif text-4xl">{item.valor.toString().padStart(2, '0')}</p>
            <div className="mt-2 flex items-center justify-between text-sm text-texto-suave">
              <span>{item.rotulo}</span>
              <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
            </div>
          </motion.button>
        ))}
      </div>
      <div className="mt-8 rounded-3xl border border-borda bg-superficie p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primaria">Visão rápida</p>
            <h2 className="mt-2 font-serif text-3xl">Próximos horários</h2>
          </div>
          <button type="button" onClick={() => mudarAba('agenda')} className="text-sm text-primaria hover:underline">
            Ver agenda →
          </button>
        </div>
        {proximos.length ? (
          <div className="mt-6 divide-y divide-borda">
            {proximos.map((a) => (
              <div key={a.id} className="flex justify-between gap-4 py-4 text-sm">
                <span>{dados.profissionais.find((p) => p.id === a.profissional_id)?.nome ?? 'Profissional'}</span>
                <time className="text-texto-suave">
                  {new Date(a.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-texto-suave">Nenhum atendimento futuro encontrado.</p>
        )}
      </div>
    </>
  );
}
