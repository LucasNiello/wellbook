'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ImagePlus, Plus } from 'lucide-react';
import {
  campoPercentual,
  esquemaFormularioProfissional,
  formatarPercentual,
  pontosBaseParaTexto,
  primeiraMensagem,
  REPASSE_PADRAO_PONTOS_BASE,
} from '@wellbook/shared';
import { erroFuncao } from '../../lib/erro-funcao';
import { ModalAnimado } from '../animata/ModalAnimado';
import { Campo } from './Campo';
import { usePainel } from './ContextoPainel';
import { TituloSecao, Vazio } from './Secao';
import { botao, estiloCampo, secundario } from './estilos';
import type { Profissional } from './tipos';

export function AbaProfissionais() {
  const { dados, setDados, tenantId, usuarioId, supabase, ocupado, setOcupado, setMensagem, avisar, erro, executar, setCredencial } = usePainel();
  const reduzir = useReducedMotion();
  const [modal, setModal] = useState<'profissional' | 'novoProfissional' | 'desativar' | 'excluirProfissional' | null>(null);
  const [edicaoProfissional, setEdicaoProfissional] = useState<Profissional | null>(null);
  const [contagemDesativacao, setContagemDesativacao] = useState<number | null>(null);
  const [formProfissional, setFormProfissional] = useState({ especialidade: '', percentual: '0' });
  // D41: o formulário de novo profissional já vem com o repasse padrão de 20% para a clínica.
  const formNovoVazio = { nome: '', email: '', telefone: '', especialidade: '', percentual: pontosBaseParaTexto(REPASSE_PADRAO_PONTOS_BASE) };
  const [formNovo, setFormNovo] = useState(formNovoVazio);
  // D30: modo "atendo sozinho" = o único profissional da empresa é o próprio admin.
  const modoSozinho = dados.profissionais.length === 1 && dados.profissionais[0]?.usuario_id === usuarioId;

  useEffect(() => {
    if (modal !== 'desativar' || !edicaoProfissional) return;
    let ativo = true;
    setContagemDesativacao(null);
    void supabase.from('agendamentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('profissional_id', edicaoProfissional.id).eq('status', 'AGENDADO').then(({ count, error }) => {
      if (!ativo) return;
      if (error) {
        setModal(null);
        setMensagem('Não foi possível verificar os agendamentos em aberto.');
      } else setContagemDesativacao(count ?? 0);
    });
    return () => {
      ativo = false;
    };
  }, [modal, edicaoProfissional, tenantId, supabase, setMensagem]);

  function abrirProfissional(profissional: Profissional) {
    setEdicaoProfissional(profissional);
    setFormProfissional({ especialidade: profissional.especialidade, percentual: pontosBaseParaTexto(profissional.percentual_repasse) });
    setModal('profissional');
  }

  async function salvarProfissional(evento: FormEvent) {
    evento.preventDefault();
    if (!edicaoProfissional) return;
    await executar(async () => {
      // A2: texto → pontos-base só com inteiros, validado pelo schema do shared.
      const r = esquemaFormularioProfissional.safeParse({
        especialidade: formProfissional.especialidade,
        percentual_repasse: formProfissional.percentual,
        ativo: edicaoProfissional.ativo,
      });
      if (!r.success) throw new Error(primeiraMensagem(r.error));
      const valores = { especialidade: r.data.especialidade, percentual_repasse: r.data.percentual_repasse };
      const { error } = await supabase.from('profissionais').update(valores).eq('id', edicaoProfissional.id).eq('tenant_id', tenantId);
      erro(error);
      setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => (p.id === edicaoProfissional.id ? { ...p, ...valores } : p)) }));
    }, 'Profissional atualizado.', () => setModal(null));
  }

  async function enviarAvatar(arquivo?: File) {
    if (!arquivo || !edicaoProfissional) return;
    const profissionalId = edicaoProfissional.id;
    await executar(async () => {
      if (arquivo.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) throw new Error('Use PNG, JPG ou WebP de até 2 MB.');
      const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${tenantId}/avatar-${crypto.randomUUID()}.${extensao}`;
      erro((await supabase.storage.from('avatares').upload(caminho, arquivo)).error);
      const url = supabase.storage.from('avatares').getPublicUrl(caminho).data.publicUrl;
      erro((await supabase.from('profissionais').update({ avatar_url: url }).eq('id', profissionalId).eq('tenant_id', tenantId)).error);
      setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => (p.id === profissionalId ? { ...p, avatar_url: url } : p)) }));
    }, 'Foto do profissional atualizada.', () => setModal(null));
  }

  async function desativarProfissional() {
    if (!edicaoProfissional) return;
    await executar(async () => {
      const { error } = await supabase.from('profissionais').update({ ativo: false }).eq('id', edicaoProfissional.id).eq('tenant_id', tenantId);
      erro(error);
      setDados((atual) => ({
        ...atual,
        profissionais: atual.profissionais.map((p) => (p.id === edicaoProfissional.id ? { ...p, ativo: false } : p)),
        agendamentos: atual.agendamentos.map((a) => (a.profissional_id === edicaoProfissional.id && a.status === 'AGENDADO' ? { ...a, status: 'CANCELADO' } : a)),
      }));
    }, 'Profissional desativado e agendamentos em aberto cancelados pelo banco.', () => setModal(null));
  }

  async function reativarProfissional(profissional: Profissional) {
    await executar(async () => {
      const { error } = await supabase.from('profissionais').update({ ativo: true }).eq('id', profissional.id).eq('tenant_id', tenantId);
      erro(error);
      setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => (p.id === profissional.id ? { ...p, ativo: true } : p)) }));
    }, 'Profissional reativado. Os agendamentos cancelados não foram restaurados.', () => setModal(null));
  }

  async function abrirExclusaoProfissional(profissional: Profissional) {
    setOcupado(true);
    setMensagem('');
    const { count, error } = await supabase.from('agendamentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('profissional_id', profissional.id);
    setOcupado(false);
    if (error) return avisar('Não foi possível verificar o histórico deste profissional.');
    if (count) return avisar('Este profissional possui histórico. Desative-o para preservar os atendimentos anteriores.');
    setEdicaoProfissional(profissional);
    setModal('excluirProfissional');
  }

  async function excluirProfissional() {
    if (!edicaoProfissional) return;
    await executar(async () => {
      const { error } = await supabase.from('profissionais').delete().eq('id', edicaoProfissional.id).eq('tenant_id', tenantId);
      erro(error);
      setDados((atual) => ({
        ...atual,
        profissionais: atual.profissionais.filter((p) => p.id !== edicaoProfissional.id),
        vinculos: atual.vinculos.filter((v) => v.profissional_id !== edicaoProfissional.id),
        horarios: atual.horarios.filter((h) => h.profissional_id !== edicaoProfissional.id),
        bloqueios: atual.bloqueios.filter((b) => b.profissional_id !== edicaoProfissional.id),
      }));
    }, 'Profissional sem histórico removido da clínica. A conta de usuário permanece ativa.', () => setModal(null));
  }

  async function criarProfissional(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setMensagem('');
    try {
      const repasse = campoPercentual.safeParse(formNovo.percentual); // A2
      if (!repasse.success) throw new Error(primeiraMensagem(repasse.error));
      const percentual = repasse.data;
      const { data, error } = await supabase.functions.invoke('criar-conta-equipe', {
        body: {
          tenantId, nome: formNovo.nome.trim(), email: formNovo.email.trim(), telefone: formNovo.telefone,
          especialidade: formNovo.especialidade.trim(), percentualRepasse: percentual,
        },
      });
      if (error) throw await erroFuncao(error);
      if (!data?.profissionalId || !data?.senhaProvisoria) throw new Error('Resposta incompleta da função de cadastro.');
      const { data: cadastrado, error: erroBusca } = await supabase.from('profissionais').select('id,usuario_id,especialidade,percentual_repasse,avatar_url,ativo').eq('id', data.profissionalId).single();
      if (erroBusca || !cadastrado) throw new Error('Conta criada, mas a lista não pôde ser atualizada. Recarregue a página.');
      setDados((atual) => ({ ...atual, profissionais: [...atual.profissionais, { ...cadastrado, nome: formNovo.nome.trim() }] }));
      setCredencial({ nome: formNovo.nome.trim(), senha: data.senhaProvisoria });
      setModal(null);
      setFormNovo(formNovoVazio);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível cadastrar o profissional.');
    } finally {
      setOcupado(false);
    }
  }

  async function adicionarAdminComoProfissional() {
    await executar(async () => {
      const { data, error } = await supabase.from('profissionais').insert({ tenant_id: tenantId, usuario_id: usuarioId, especialidade: 'Atendimento', percentual_repasse: REPASSE_PADRAO_PONTOS_BASE }).select('id,usuario_id,especialidade,percentual_repasse,avatar_url,ativo').single();
      erro(error);
      if (data) setDados((atual) => ({ ...atual, profissionais: [...atual.profissionais, { ...data, nome: 'Você' }] }));
    }, 'Você foi adicionado à equipe de atendimento.', () => setModal(null));
  }

  async function alternarVinculo(profissionalId: string, servicoId: string) {
    const existe = dados.vinculos.some((v) => v.profissional_id === profissionalId && v.servico_id === servicoId);
    await executar(async () => {
      if (existe) erro((await supabase.from('profissional_servicos').delete().eq('profissional_id', profissionalId).eq('servico_id', servicoId).eq('tenant_id', tenantId)).error);
      else erro((await supabase.from('profissional_servicos').insert({ tenant_id: tenantId, profissional_id: profissionalId, servico_id: servicoId })).error);
      setDados((atual) => ({
        ...atual,
        vinculos: existe ? atual.vinculos.filter((v) => !(v.profissional_id === profissionalId && v.servico_id === servicoId)) : [...atual.vinculos, { profissional_id: profissionalId, servico_id: servicoId }],
      }));
    }, existe ? 'Vínculo removido.' : 'Serviço vinculado.', () => setModal(null));
  }

  return (
    <>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          {modoSozinho ? (
            <TituloSecao etiqueta="Pessoas" titulo="Seu atendimento" descricao="Você atende sozinho. Quando quiser montar uma equipe, adicione um profissional." />
          ) : (
            <TituloSecao etiqueta="Pessoas" titulo="Profissionais" descricao="Especialidades, repasses e serviços de quem atende na clínica." />
          )}
          <button type="button" onClick={() => { setCredencial(null); setModal('novoProfissional'); }} className={modoSozinho ? secundario : botao}>
            <Plus size={17} /> {modoSozinho ? 'Adicionar profissional à equipe' : 'Novo profissional'}
          </button>
          {!dados.profissionais.some((p) => p.usuario_id === usuarioId) && (
            <button type="button" onClick={() => void adicionarAdminComoProfissional()} disabled={ocupado} className={secundario}>
              <Plus size={17} /> Eu também atendo
            </button>
          )}
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          {dados.profissionais.map((p) => (
            <motion.article whileHover={reduzir ? undefined : { y: -4 }} key={p.id} className="rounded-3xl border border-borda bg-superficie p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-superficie-vitrine font-serif text-2xl text-primaria">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    p.nome.charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-serif text-2xl">{p.nome}</h3>
                      <p className="text-sm text-texto-suave">{p.especialidade}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs ${p.ativo ? 'bg-superficie-vitrine text-primaria' : 'bg-fundo text-texto-suave'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {(!modoSozinho || p.percentual_repasse !== 0) && (
                    <p className="mt-5 text-xs uppercase tracking-widest text-texto-suave">
                      Repasse da clínica <strong className="ml-2 text-base tracking-normal text-texto">{formatarPercentual(p.percentual_repasse)}</strong>
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 border-t border-borda pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-texto-suave">Serviços vinculados</p>
                <div className="flex flex-wrap gap-2">
                  {dados.servicos.filter((s) => s.ativo).map((s) => {
                    const vinculado = dados.vinculos.some((v) => v.profissional_id === p.id && v.servico_id === s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={ocupado}
                        onClick={() => void alternarVinculo(p.id, s.id)}
                        aria-pressed={vinculado}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${vinculado ? 'border-primaria bg-superficie-vitrine text-primaria' : 'border-borda text-texto-suave hover:border-primaria'}`}
                      >
                        {vinculado ? '✓ ' : '+ '}
                        {s.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => abrirProfissional(p)} className={secundario}>
                  Editar dados
                </button>
                {modoSozinho && p.ativo ? null : p.ativo ? (
                  <button type="button" onClick={() => { setEdicaoProfissional(p); setContagemDesativacao(null); setModal('desativar'); }} className="text-sm text-texto-suave hover:underline">
                    Desativar
                  </button>
                ) : (
                  <button type="button" disabled={ocupado} onClick={() => void reativarProfissional(p)} className="text-sm text-primaria hover:underline">
                    Reativar
                  </button>
                )}
                {!modoSozinho && (
                  <button type="button" disabled={ocupado} onClick={() => void abrirExclusaoProfissional(p)} className="text-sm text-texto-suave hover:underline">
                    Remover
                  </button>
                )}
              </div>
            </motion.article>
          ))}
        </div>
        {!dados.profissionais.length && <Vazio texto="Nenhum profissional cadastrado ainda." />}
        {!modoSozinho && (
          <p className="mt-6 max-w-2xl text-sm text-texto-suave">A nova conta recebe uma senha provisória que deve ser entregue em particular.</p>
        )}
      </section>

      <ModalAnimado aberto={modal === 'novoProfissional'} titulo="Novo profissional" aoFechar={() => setModal(null)}>
        <form onSubmit={criarProfissional} className="space-y-4">
          <Campo titulo="Nome completo">
            <input className={estiloCampo} required minLength={2} maxLength={120} autoComplete="name" value={formNovo.nome} onChange={(e) => setFormNovo({ ...formNovo, nome: e.target.value })} />
          </Campo>
          <Campo titulo="E-mail">
            <input className={estiloCampo} required type="email" autoComplete="email" value={formNovo.email} onChange={(e) => setFormNovo({ ...formNovo, email: e.target.value })} />
          </Campo>
          <Campo titulo="Telefone com DDD">
            <input className={estiloCampo} inputMode="tel" value={formNovo.telefone} onChange={(e) => setFormNovo({ ...formNovo, telefone: e.target.value })} />
          </Campo>
          <Campo titulo="Especialidade">
            <input className={estiloCampo} required minLength={2} maxLength={80} value={formNovo.especialidade} onChange={(e) => setFormNovo({ ...formNovo, especialidade: e.target.value })} />
          </Campo>
          <Campo titulo="Repasse da clínica (%)">
            <input className={estiloCampo} required inputMode="decimal" value={formNovo.percentual} onChange={(e) => setFormNovo({ ...formNovo, percentual: e.target.value })} />
          </Campo>
          <p className="text-xs text-texto-suave">Uma senha provisória será gerada e mostrada apenas após o cadastro.</p>
          <button type="submit" disabled={ocupado} className={botao}>
            Criar conta <ArrowRight size={16} />
          </button>
        </form>
      </ModalAnimado>
      <ModalAnimado aberto={modal === 'profissional'} titulo="Editar profissional" aoFechar={() => setModal(null)}>
        <form onSubmit={salvarProfissional} className="space-y-5">
          <p className="text-sm text-texto-suave">{edicaoProfissional?.nome}</p>
          <Campo titulo="Especialidade">
            <input className={estiloCampo} required minLength={2} maxLength={80} value={formProfissional.especialidade} onChange={(e) => setFormProfissional({ ...formProfissional, especialidade: e.target.value })} />
          </Campo>
          {(!modoSozinho || (edicaoProfissional?.percentual_repasse ?? 0) !== 0) && (
            <Campo titulo="Repasse da clínica (%)">
              <input className={estiloCampo} inputMode="decimal" value={formProfissional.percentual} onChange={(e) => setFormProfissional({ ...formProfissional, percentual: e.target.value })} />
            </Campo>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-primaria">
            <ImagePlus size={18} /> Atualizar foto (PNG, JPG ou WebP, até 2 MB)
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void enviarAvatar(e.target.files?.[0])} />
          </label>
          <button className={botao} disabled={ocupado} type="submit">
            Salvar profissional <ArrowRight size={16} />
          </button>
        </form>
      </ModalAnimado>
      <ModalAnimado aberto={modal === 'desativar'} titulo="Desativar profissional?" aoFechar={() => setModal(null)}>
        <p className="text-sm leading-7 text-texto-suave">
          <strong className="text-texto">{edicaoProfissional?.nome}</strong> deixará de aparecer na equipe.{' '}
          <strong className="text-texto">{contagemDesativacao === null ? 'Verificando agendamentos…' : `${contagemDesativacao} agendamento(s) em aberto`}</strong>{' '}
          serão cancelados automaticamente pelo banco. A reativação não restaura esses agendamentos.
        </p>
        <div className="mt-7 flex gap-3">
          <button type="button" onClick={() => setModal(null)} className={secundario}>
            Voltar
          </button>
          <button type="button" disabled={ocupado || contagemDesativacao === null} onClick={() => void desativarProfissional()} className={botao}>
            Confirmar desativação
          </button>
        </div>
      </ModalAnimado>
      <ModalAnimado aberto={modal === 'excluirProfissional'} titulo="Remover profissional?" aoFechar={() => setModal(null)}>
        <p className="text-sm leading-6 text-texto-suave">
          <strong className="text-texto">{edicaoProfissional?.nome}</strong> não possui histórico de atendimentos. O vínculo com a clínica, os horários e os serviços serão removidos. A conta de usuário continuará ativa.
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => setModal(null)} className={secundario}>
            Voltar
          </button>
          <button type="button" disabled={ocupado} onClick={() => void excluirProfissional()} className={botao}>
            Remover da clínica
          </button>
        </div>
      </ModalAnimado>
    </>
  );
}
