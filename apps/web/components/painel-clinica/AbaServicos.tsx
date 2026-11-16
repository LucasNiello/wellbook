'use client';

import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Clock3, Plus, Scissors, Wallet } from 'lucide-react';
import { centavosParaTexto, esquemaFormularioServico, formatarReais, primeiraMensagem } from '@wellbook/shared';
import { ModalAnimado } from '../animata/ModalAnimado';
import { Campo } from './Campo';
import { usePainel } from './ContextoPainel';
import { TituloSecao, Vazio } from './Secao';
import { botao, estiloCampo, secundario } from './estilos';
import type { Servico } from './tipos';

export function AbaServicos() {
  const { dados, setDados, tenantId, supabase, ocupado, setOcupado, setMensagem, avisar, erro, executar } = usePainel();
  const reduzir = useReducedMotion();
  const [modal, setModal] = useState<'servico' | 'excluirServico' | null>(null);
  const [edicaoServico, setEdicaoServico] = useState<Servico | null>(null);
  const [formServico, setFormServico] = useState({ nome: '', duracao: '60', preco: '' });

  function abrirServico(servico?: Servico) {
    setEdicaoServico(servico ?? null);
    setFormServico({ nome: servico?.nome ?? '', duracao: String(servico?.duracao_min ?? 60), preco: servico ? centavosParaTexto(servico.preco) : '' });
    setModal('servico');
  }

  async function salvarServico(evento: FormEvent) {
    evento.preventDefault();
    await executar(async () => {
      // A2: preço digitado → centavos só com inteiros, validado pelo schema do shared.
      const r = esquemaFormularioServico.safeParse({
        nome: formServico.nome,
        duracao_min: formServico.duracao,
        preco: formServico.preco,
        ativo: edicaoServico?.ativo ?? true,
      });
      if (!r.success) throw new Error(primeiraMensagem(r.error));
      const valores = { nome: r.data.nome, duracao_min: r.data.duracao_min, preco: r.data.preco };
      if (edicaoServico) {
        const { error } = await supabase.from('servicos').update(valores).eq('id', edicaoServico.id).eq('tenant_id', tenantId);
        erro(error);
        setDados((atual) => ({ ...atual, servicos: atual.servicos.map((s) => (s.id === edicaoServico.id ? { ...s, ...valores } : s)) }));
      } else {
        const { data, error } = await supabase.from('servicos').insert({ ...valores, tenant_id: tenantId }).select('id,nome,duracao_min,preco,ativo').single();
        erro(error);
        if (data) setDados((atual) => ({ ...atual, servicos: [...atual.servicos, data] }));
      }
    }, edicaoServico ? 'Serviço atualizado.' : 'Serviço criado.', () => setModal(null));
  }

  async function alternarServico(servico: Servico) {
    await executar(async () => {
      const { error } = await supabase.from('servicos').update({ ativo: !servico.ativo }).eq('id', servico.id).eq('tenant_id', tenantId);
      erro(error);
      setDados((atual) => ({ ...atual, servicos: atual.servicos.map((s) => (s.id === servico.id ? { ...s, ativo: !s.ativo } : s)) }));
    }, servico.ativo ? 'Serviço desativado.' : 'Serviço reativado.', () => setModal(null));
  }

  async function abrirExclusaoServico(servico: Servico) {
    setOcupado(true);
    setMensagem('');
    const { count, error } = await supabase.from('agendamento_servicos').select('servico_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('servico_id', servico.id);
    setOcupado(false);
    if (error) return avisar('Não foi possível verificar o histórico deste serviço.');
    if (count) return avisar('Este serviço possui histórico. Desative-o para preservar os atendimentos anteriores.');
    setEdicaoServico(servico);
    setModal('excluirServico');
  }

  async function excluirServico() {
    if (!edicaoServico) return;
    await executar(async () => {
      const { error } = await supabase.from('servicos').delete().eq('id', edicaoServico.id).eq('tenant_id', tenantId);
      erro(error);
      setDados((atual) => ({ ...atual, servicos: atual.servicos.filter((s) => s.id !== edicaoServico.id), vinculos: atual.vinculos.filter((v) => v.servico_id !== edicaoServico.id) }));
    }, 'Serviço sem histórico excluído.', () => setModal(null));
  }

  return (
    <>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <TituloSecao etiqueta="Catálogo" titulo="Serviços" descricao="Crie uma oferta clara, com duração e preço definidos." />
          <button type="button" onClick={() => abrirServico()} className={botao}>
            <Plus size={18} /> Novo serviço
          </button>
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          {dados.servicos.map((s) => (
            <motion.article whileHover={reduzir ? undefined : { y: -4 }} key={s.id} className="rounded-3xl border border-borda bg-superficie p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-superficie-vitrine text-primaria">
                  <Scissors size={20} />
                </span>
                <span className="text-xs text-texto-suave">{s.ativo ? 'Disponível' : 'Inativo'}</span>
              </div>
              <h3 className="mt-7 font-serif text-3xl">{s.nome}</h3>
              <div className="mt-3 flex items-center gap-4 text-sm text-texto-suave">
                <span className="flex items-center gap-1">
                  <Clock3 size={15} />
                  {s.duracao_min} min
                </span>
                <span className="flex items-center gap-1">
                  <Wallet size={15} />
                  {formatarReais(s.preco)}
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-4 border-t border-borda pt-5">
                <button type="button" onClick={() => abrirServico(s)} className="text-sm font-medium text-primaria hover:underline">
                  Editar serviço
                </button>
                <button type="button" disabled={ocupado} onClick={() => void alternarServico(s)} className="text-sm text-texto-suave hover:underline">
                  {s.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button type="button" disabled={ocupado} onClick={() => void abrirExclusaoServico(s)} className="text-sm text-texto-suave hover:underline">
                  Excluir
                </button>
              </div>
            </motion.article>
          ))}
        </div>
        {!dados.servicos.length && <Vazio texto="Nenhum serviço cadastrado. Comece pelo primeiro." />}
      </section>

      <ModalAnimado aberto={modal === 'servico'} titulo={edicaoServico ? 'Editar serviço' : 'Novo serviço'} aoFechar={() => setModal(null)}>
        <form onSubmit={salvarServico} className="space-y-5">
          <Campo titulo="Nome">
            <input className={estiloCampo} required minLength={2} maxLength={120} value={formServico.nome} onChange={(e) => setFormServico({ ...formServico, nome: e.target.value })} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo titulo="Duração (minutos)">
              <input className={estiloCampo} type="number" min={5} max={720} required value={formServico.duracao} onChange={(e) => setFormServico({ ...formServico, duracao: e.target.value })} />
            </Campo>
            <Campo titulo="Preço (R$)">
              <input className={estiloCampo} inputMode="decimal" placeholder="150,00" required value={formServico.preco} onChange={(e) => setFormServico({ ...formServico, preco: e.target.value })} />
            </Campo>
          </div>
          <button className={botao} disabled={ocupado} type="submit">
            Salvar serviço <ArrowRight size={16} />
          </button>
        </form>
      </ModalAnimado>
      <ModalAnimado aberto={modal === 'excluirServico'} titulo="Excluir serviço?" aoFechar={() => setModal(null)}>
        <p className="text-sm leading-6 text-texto-suave">
          O serviço <strong className="text-texto">{edicaoServico?.nome}</strong> não tem histórico de atendimentos. Esta exclusão também remove os vínculos com profissionais.
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => setModal(null)} className={secundario}>
            Voltar
          </button>
          <button type="button" disabled={ocupado} onClick={() => void excluirServico()} className={botao}>
            Excluir serviço
          </button>
        </div>
      </ModalAnimado>
    </>
  );
}
