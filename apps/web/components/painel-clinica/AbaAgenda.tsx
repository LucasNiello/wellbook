'use client';

import { CORES_STATUS } from '@wellbook/shared';
import { usePainel } from './ContextoPainel';
import { TituloSecao } from './Secao';
import type { Agendamento, Profissional } from './tipos';

export function AbaAgenda() {
  const { dados } = usePainel();
  return (
    <section>
      <TituloSecao etiqueta="Somente leitura" titulo="Agenda da equipe" descricao="Os profissionais administram seus próprios horários e bloqueios. Aqui você acompanha a disponibilidade." />
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {dados.profissionais.map((p) => (
          <div key={p.id} className="rounded-3xl border border-borda bg-superficie p-6">
            <h3 className="font-serif text-2xl">{p.nome}</h3>
            <p className="mt-1 text-sm text-texto-suave">{p.especialidade}</p>
            <div className="mt-5 space-y-2 border-t border-borda pt-5 text-sm">
              {dados.horarios
                .filter((h) => h.profissional_id === p.id)
                .map((h) => (
                  <p key={h.id} className="flex justify-between">
                    <span>{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][h.dia_semana] ?? `Dia ${h.dia_semana}`}</span>
                    <span className="text-texto-suave">{h.hora_inicio.slice(0, 5)}–{h.hora_fim.slice(0, 5)}</span>
                  </p>
                ))}
              {!dados.horarios.some((h) => h.profissional_id === p.id) && <p className="text-texto-suave">Sem horários definidos.</p>}
            </div>
            <p className="mt-5 text-xs text-texto-suave">
              {dados.bloqueios.filter((b) => b.profissional_id === p.id).length} bloqueio(s) futuro(s) · {dados.agendamentos.filter((a) => a.profissional_id === p.id && a.status === 'AGENDADO').length} atendimento(s) agendado(s)
            </p>
          </div>
        ))}
      </div>
      <ListaAgenda agendamentos={dados.agendamentos} profissionais={dados.profissionais} />
    </section>
  );
}

function ListaAgenda({ agendamentos, profissionais }: { agendamentos: Agendamento[]; profissionais: Profissional[] }) {
  return (
    <div className="mt-8 rounded-3xl border border-borda bg-superficie p-7">
      <h3 className="font-serif text-3xl">Atendimentos</h3>
      <p className="mt-2 text-sm text-texto-suave">Nome e telefone para acolhimento na recepção. A agenda é administrada pelo profissional.</p>
      <div className="mt-6 divide-y divide-borda">
        {agendamentos.map((a) => (
          <article key={a.id} className="grid gap-3 py-5 md:grid-cols-[150px_1fr_auto] md:items-center">
            <time className="text-sm font-medium">
              {new Date(a.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
            </time>
            <div>
              <p className="font-medium">{a.cliente_nome}</p>
              <p className="mt-1 text-sm text-texto-suave">
                {profissionais.find((p) => p.id === a.profissional_id)?.nome ?? 'Profissional'} · {a.servicos.join(', ') || 'Serviço'}
              </p>
              {a.cliente_telefone && (
                <a href={`tel:${a.cliente_telefone}`} className="mt-1 inline-block text-sm text-primaria hover:underline">
                  {a.cliente_telefone}
                </a>
              )}
            </div>
            <span className="w-fit rounded-full px-3 py-1 text-xs font-semibold" style={{ background: CORES_STATUS[a.status].fundo, color: CORES_STATUS[a.status].texto }}>
              {CORES_STATUS[a.status].rotulo}
            </span>
          </article>
        ))}
        {!agendamentos.length && <p className="py-6 text-sm text-texto-suave">Nenhum atendimento recente ou futuro.</p>}
      </div>
    </div>
  );
}
