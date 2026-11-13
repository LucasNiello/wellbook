'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Heart, ImagePlus, LayoutDashboard, Palette, Plus, Scissors, Sparkles, Users, Wallet } from 'lucide-react';
import { CORES_STATUS, LISTA_TEMAS, TEMAS, formatarReais, variaveisCss, type IdTema, type StatusAgendamento } from '@wellbook/shared';
import { criarClienteNavegador } from '../lib/supabase/navegador';
import { erroFuncao } from '../lib/erro-funcao';
import { BotaoSair } from './BotaoSair';
import { AbasFluidas } from './animata/AbasFluidas';
import { BordaAnimada } from './animata/BordaAnimada';
import { ModalAnimado } from './animata/ModalAnimado';

type Clinica = { id: string; nome: string; slug: string; logo_url: string | null; tema: string; whatsapp: string | null; endereco: string | null; prazo_cancelamento_min: number; ativo: boolean };
type Servico = { id: string; nome: string; duracao_min: number; preco: number; ativo: boolean };
type Profissional = { id: string; usuario_id: string; nome: string; especialidade: string; percentual_repasse: number; avatar_url: string | null; ativo: boolean };
type Vinculo = { profissional_id: string; servico_id: string };
type Horario = { id: string; profissional_id: string; dia_semana: number; hora_inicio: string; hora_fim: string };
type Bloqueio = { id: string; profissional_id: string; inicio: string; fim: string; motivo: string | null };
type Agendamento = { id: string; profissional_id: string; cliente_nome: string; cliente_telefone: string | null; inicio: string; fim: string; status: StatusAgendamento; servicos: string[] };
export type DadosPainel = { clinica: Clinica; servicos: Servico[]; profissionais: Profissional[]; vinculos: Vinculo[]; horarios: Horario[]; bloqueios: Bloqueio[]; agendamentos: Agendamento[]; usuarioId: string };
type Aba = 'visao' | 'clinica' | 'equipe' | 'servicos' | 'agenda';

const ABAS = [
  { id: 'visao', rotulo: 'Visão geral', icone: <LayoutDashboard size={16} /> },
  { id: 'clinica', rotulo: 'Minha clínica', icone: <Palette size={16} /> },
  { id: 'equipe', rotulo: 'Profissionais', icone: <Users size={16} /> },
  { id: 'servicos', rotulo: 'Serviços', icone: <Scissors size={16} /> },
  { id: 'agenda', rotulo: 'Agenda', icone: <CalendarDays size={16} /> },
] as const;

const estiloCampo = 'mt-2 w-full rounded-xl border border-borda bg-fundo px-4 py-3 text-sm text-texto outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/15';
const botao = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primaria px-5 py-2.5 text-sm font-semibold text-texto-sobre-primaria shadow-sm transition hover:bg-primaria-pressionada focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria disabled:opacity-50';
const secundario = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-borda bg-superficie px-5 py-2.5 text-sm font-medium text-texto transition hover:bg-superficie-vitrine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria';

export function PainelClinica({ dadosIniciais }: { dadosIniciais: DadosPainel }) {
  const [dados, setDados] = useState(dadosIniciais);
  const [aba, setAba] = useState<Aba>('visao');
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState<'servico' | 'excluirServico' | 'profissional' | 'novoProfissional' | 'desativar' | 'excluirProfissional' | null>(null);
  const [edicaoServico, setEdicaoServico] = useState<Servico | null>(null);
  const [edicaoProfissional, setEdicaoProfissional] = useState<Profissional | null>(null);
  const [contagemDesativacao, setContagemDesativacao] = useState<number | null>(null);
  const [temaPreview, setTemaPreview] = useState<IdTema>(dadosIniciais.clinica.tema as IdTema);
  const [formClinica, setFormClinica] = useState({ nome: dadosIniciais.clinica.nome, whatsapp: dadosIniciais.clinica.whatsapp ?? '', endereco: dadosIniciais.clinica.endereco ?? '', prazo: String(dadosIniciais.clinica.prazo_cancelamento_min) });
  const [formServico, setFormServico] = useState({ nome: '', duracao: '60', preco: '' });
  const [formProfissional, setFormProfissional] = useState({ especialidade: '', percentual: '0' });
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', especialidade: '', percentual: '0' });
  const [credencial, setCredencial] = useState<{ nome: string; senha: string } | null>(null);
  const reduzir = useReducedMotion();
  const supabase = useMemo(criarClienteNavegador, []);
  const temaAtual = LISTA_TEMAS.find((tema) => tema.id === dados.clinica.tema) ?? TEMAS.salvia;
  const ativos = dados.profissionais.filter((p) => p.ativo);
  const servicosAtivos = dados.servicos.filter((s) => s.ativo);
  const futuros = dados.agendamentos.filter((a) => a.status === 'AGENDADO' && new Date(a.inicio).getTime() > Date.now());
  const proximos = [...futuros].sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 4);
  useEffect(() => {
    if (modal !== 'desativar' || !edicaoProfissional) return;
    let ativo = true;
    setContagemDesativacao(null);
    void supabase.from('agendamentos').select('id', { count: 'exact', head: true }).eq('tenant_id', dados.clinica.id).eq('profissional_id', edicaoProfissional.id).eq('status', 'AGENDADO').then(({ count, error }) => {
      if (!ativo) return;
      if (error) { setModal(null); setMensagem('Não foi possível verificar os agendamentos em aberto.'); }
      else setContagemDesativacao(count ?? 0);
    });
    return () => { ativo = false; };
  }, [modal, edicaoProfissional, dados.clinica.id, supabase]);
  const mudarAba = (destino: Aba) => { setAba(destino); setMensagem(''); };
  const avisar = (texto: string) => { setMensagem(texto); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const erro = (falha: { message: string } | null) => { if (falha) throw new Error(falha.message); };

  async function executar(acao: () => Promise<void>, sucesso: string) {
    setOcupado(true); setMensagem('');
    try { await acao(); avisar(sucesso); setModal(null); }
    catch (e) { avisar(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { setOcupado(false); }
  }

  async function salvarClinica(evento: FormEvent) {
    evento.preventDefault();
    await executar(async () => {
      const prazo = Number(formClinica.prazo);
      if (!Number.isInteger(prazo) || prazo < 0 || prazo > 43200) throw new Error('Informe um prazo entre 0 e 43200 minutos.');
      const valores = { nome: formClinica.nome.trim(), whatsapp: formClinica.whatsapp.replace(/\D/g, '') || null, endereco: formClinica.endereco.trim() || null, prazo_cancelamento_min: prazo };
      const { error } = await supabase.from('tenants').update(valores).eq('id', dados.clinica.id);
      erro(error); setDados((atual) => ({ ...atual, clinica: { ...atual.clinica, ...valores } }));
    }, 'Dados da clínica atualizados.');
  }

  async function salvarTema() {
    await executar(async () => {
      const { data, error } = await supabase.from('tenants').update({ tema: temaPreview }).eq('id', dados.clinica.id).select('tema').single();
      erro(error);
      if (!data) throw new Error('Não foi possível confirmar o tema salvo.');
      setDados((atual) => ({ ...atual, clinica: { ...atual.clinica, tema: data.tema } }));
    }, 'Tema aplicado à clínica.');
  }

  async function enviarLogo(arquivo?: File) {
    if (!arquivo) return;
    await executar(async () => {
      if (arquivo.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) throw new Error('Use PNG, JPG ou WebP de até 2 MB.');
      const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${dados.clinica.id}/logo-${crypto.randomUUID()}.${extensao}`;
      const envio = await supabase.storage.from('logos').upload(caminho, arquivo);
      erro(envio.error);
      const url = supabase.storage.from('logos').getPublicUrl(caminho).data.publicUrl;
      const gravacao = await supabase.from('tenants').update({ logo_url: url }).eq('id', dados.clinica.id);
      erro(gravacao.error); setDados((atual) => ({ ...atual, clinica: { ...atual.clinica, logo_url: url } }));
    }, 'Logo atualizado.');
  }

  function abrirServico(servico?: Servico) {
    setEdicaoServico(servico ?? null); setFormServico({ nome: servico?.nome ?? '', duracao: String(servico?.duracao_min ?? 60), preco: servico ? (servico.preco / 100).toFixed(2).replace('.', ',') : '' }); setModal('servico');
  }
  async function salvarServico(evento: FormEvent) {
    evento.preventDefault();
    await executar(async () => {
      const preco = Math.round(Number(formServico.preco.replace(',', '.')) * 100);
      const duracao = Number(formServico.duracao);
      if (!Number.isInteger(preco) || preco < 0 || !Number.isInteger(duracao) || duracao < 5 || duracao > 720) throw new Error('Confira o preço e a duração do serviço.');
      const valores = { nome: formServico.nome.trim(), duracao_min: duracao, preco };
      if (edicaoServico) {
        const { error } = await supabase.from('servicos').update(valores).eq('id', edicaoServico.id).eq('tenant_id', dados.clinica.id);
        erro(error); setDados((atual) => ({ ...atual, servicos: atual.servicos.map((s) => s.id === edicaoServico.id ? { ...s, ...valores } : s) }));
      } else {
        const { data, error } = await supabase.from('servicos').insert({ ...valores, tenant_id: dados.clinica.id }).select('id,nome,duracao_min,preco,ativo').single();
        erro(error); if (data) setDados((atual) => ({ ...atual, servicos: [...atual.servicos, data] }));
      }
    }, edicaoServico ? 'Serviço atualizado.' : 'Serviço criado.');
  }
  async function alternarServico(servico: Servico) {
    await executar(async () => {
      const { error } = await supabase.from('servicos').update({ ativo: !servico.ativo }).eq('id', servico.id).eq('tenant_id', dados.clinica.id);
      erro(error); setDados((atual) => ({ ...atual, servicos: atual.servicos.map((s) => s.id === servico.id ? { ...s, ativo: !s.ativo } : s) }));
    }, servico.ativo ? 'Serviço desativado.' : 'Serviço reativado.');
  }
  async function abrirExclusaoServico(servico: Servico) {
    setOcupado(true); setMensagem('');
    const { count, error } = await supabase.from('agendamento_servicos').select('servico_id', { count: 'exact', head: true }).eq('tenant_id', dados.clinica.id).eq('servico_id', servico.id);
    setOcupado(false);
    if (error) return avisar('Não foi possível verificar o histórico deste serviço.');
    if (count) return avisar('Este serviço possui histórico. Desative-o para preservar os atendimentos anteriores.');
    setEdicaoServico(servico); setModal('excluirServico');
  }
  async function excluirServico() {
    if (!edicaoServico) return;
    await executar(async () => {
      const { error } = await supabase.from('servicos').delete().eq('id', edicaoServico.id).eq('tenant_id', dados.clinica.id);
      erro(error);
      setDados((atual) => ({ ...atual, servicos: atual.servicos.filter((s) => s.id !== edicaoServico.id), vinculos: atual.vinculos.filter((v) => v.servico_id !== edicaoServico.id) }));
    }, 'Serviço sem histórico excluído.');
  }

  function abrirProfissional(profissional: Profissional) { setEdicaoProfissional(profissional); setFormProfissional({ especialidade: profissional.especialidade, percentual: (profissional.percentual_repasse / 100).toFixed(2).replace('.', ',') }); setModal('profissional'); }
  async function salvarProfissional(evento: FormEvent) {
    evento.preventDefault(); if (!edicaoProfissional) return;
    await executar(async () => {
      const percentual = Math.round(Number(formProfissional.percentual.replace(',', '.')) * 100);
      if (!Number.isInteger(percentual) || percentual < 0 || percentual > 10000) throw new Error('Informe um percentual entre 0% e 100%.');
      const valores = { especialidade: formProfissional.especialidade.trim(), percentual_repasse: percentual };
      const { error } = await supabase.from('profissionais').update(valores).eq('id', edicaoProfissional.id).eq('tenant_id', dados.clinica.id);
      erro(error); setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => p.id === edicaoProfissional.id ? { ...p, ...valores } : p) }));
    }, 'Profissional atualizado.');
  }
  async function enviarAvatar(arquivo?: File) {
    if (!arquivo || !edicaoProfissional) return;
    const profissionalId = edicaoProfissional.id;
    await executar(async () => {
      if (arquivo.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) throw new Error('Use PNG, JPG ou WebP de até 2 MB.');
      const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${dados.clinica.id}/avatar-${crypto.randomUUID()}.${extensao}`;
      erro((await supabase.storage.from('avatares').upload(caminho, arquivo)).error);
      const url = supabase.storage.from('avatares').getPublicUrl(caminho).data.publicUrl;
      erro((await supabase.from('profissionais').update({ avatar_url: url }).eq('id', profissionalId).eq('tenant_id', dados.clinica.id)).error);
      setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => p.id === profissionalId ? { ...p, avatar_url: url } : p) }));
    }, 'Foto do profissional atualizada.');
  }
  async function desativarProfissional() {
    if (!edicaoProfissional) return;
    await executar(async () => {
      const { error } = await supabase.from('profissionais').update({ ativo: false }).eq('id', edicaoProfissional.id).eq('tenant_id', dados.clinica.id);
      erro(error); setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => p.id === edicaoProfissional.id ? { ...p, ativo: false } : p), agendamentos: atual.agendamentos.map((a) => a.profissional_id === edicaoProfissional.id && a.status === 'AGENDADO' ? { ...a, status: 'CANCELADO' } : a) }));
    }, 'Profissional desativado e agendamentos em aberto cancelados pelo banco.');
  }
  async function reativarProfissional(profissional: Profissional) {
    await executar(async () => {
      const { error } = await supabase.from('profissionais').update({ ativo: true }).eq('id', profissional.id).eq('tenant_id', dados.clinica.id);
      erro(error);
      setDados((atual) => ({ ...atual, profissionais: atual.profissionais.map((p) => p.id === profissional.id ? { ...p, ativo: true } : p) }));
    }, 'Profissional reativado. Os agendamentos cancelados não foram restaurados.');
  }
  async function abrirExclusaoProfissional(profissional: Profissional) {
    setOcupado(true); setMensagem('');
    const { count, error } = await supabase.from('agendamentos').select('id', { count: 'exact', head: true }).eq('tenant_id', dados.clinica.id).eq('profissional_id', profissional.id);
    setOcupado(false);
    if (error) return avisar('Não foi possível verificar o histórico deste profissional.');
    if (count) return avisar('Este profissional possui histórico. Desative-o para preservar os atendimentos anteriores.');
    setEdicaoProfissional(profissional); setModal('excluirProfissional');
  }
  async function excluirProfissional() {
    if (!edicaoProfissional) return;
    await executar(async () => {
      const { error } = await supabase.from('profissionais').delete().eq('id', edicaoProfissional.id).eq('tenant_id', dados.clinica.id);
      erro(error);
      setDados((atual) => ({ ...atual, profissionais: atual.profissionais.filter((p) => p.id !== edicaoProfissional.id), vinculos: atual.vinculos.filter((v) => v.profissional_id !== edicaoProfissional.id), horarios: atual.horarios.filter((h) => h.profissional_id !== edicaoProfissional.id), bloqueios: atual.bloqueios.filter((b) => b.profissional_id !== edicaoProfissional.id) }));
    }, 'Profissional sem histórico removido da clínica. A conta de usuário permanece ativa.');
  }
  async function criarProfissional(evento: FormEvent) {
    evento.preventDefault(); setOcupado(true); setMensagem('');
    try {
      const percentual = Math.round(Number(formNovo.percentual.replace(',', '.')) * 100);
      if (!Number.isInteger(percentual) || percentual < 0 || percentual > 10000) throw new Error('Informe um repasse entre 0% e 100%.');
      const { data, error } = await supabase.functions.invoke('criar-conta-equipe', { body: {
        tipo: 'profissional', tenantId: dados.clinica.id, nome: formNovo.nome.trim(), email: formNovo.email.trim(), telefone: formNovo.telefone,
        especialidade: formNovo.especialidade.trim(), percentualRepasse: percentual,
      } });
      if (error) throw await erroFuncao(error);
      if (!data?.profissionalId || !data?.senhaProvisoria) throw new Error('Resposta incompleta da função de cadastro.');
      const { data: cadastrado, error: erroBusca } = await supabase.from('profissionais').select('id,usuario_id,especialidade,percentual_repasse,avatar_url,ativo').eq('id', data.profissionalId).single();
      if (erroBusca || !cadastrado) throw new Error('Conta criada, mas a lista não pôde ser atualizada. Recarregue a página.');
      setDados((atual) => ({ ...atual, profissionais: [...atual.profissionais, { ...cadastrado, nome: formNovo.nome.trim() }] }));
      setCredencial({ nome: formNovo.nome.trim(), senha: data.senhaProvisoria });
      setModal(null); setFormNovo({ nome: '', email: '', telefone: '', especialidade: '', percentual: '0' });
    } catch (e) { avisar(e instanceof Error ? e.message : 'Não foi possível cadastrar o profissional.'); }
    finally { setOcupado(false); }
  }
  async function adicionarAdminComoProfissional() {
    await executar(async () => {
      const { data, error } = await supabase.from('profissionais').insert({ tenant_id: dados.clinica.id, usuario_id: dados.usuarioId, especialidade: 'Atendimento', percentual_repasse: 0 }).select('id,usuario_id,especialidade,percentual_repasse,avatar_url,ativo').single();
      erro(error); if (data) setDados((atual) => ({ ...atual, profissionais: [...atual.profissionais, { ...data, nome: 'Você' }] }));
    }, 'Você foi adicionado à equipe de atendimento.');
  }
  async function alternarVinculo(profissionalId: string, servicoId: string) {
    const existe = dados.vinculos.some((v) => v.profissional_id === profissionalId && v.servico_id === servicoId);
    await executar(async () => {
      if (existe) erro((await supabase.from('profissional_servicos').delete().eq('profissional_id', profissionalId).eq('servico_id', servicoId).eq('tenant_id', dados.clinica.id)).error);
      else erro((await supabase.from('profissional_servicos').insert({ tenant_id: dados.clinica.id, profissional_id: profissionalId, servico_id: servicoId })).error);
      setDados((atual) => ({ ...atual, vinculos: existe ? atual.vinculos.filter((v) => !(v.profissional_id === profissionalId && v.servico_id === servicoId)) : [...atual.vinculos, { profissional_id: profissionalId, servico_id: servicoId }] }));
    }, existe ? 'Vínculo removido.' : 'Serviço vinculado.');
  }

  return <div style={variaveisCss(temaAtual.id) as CSSProperties} className="min-h-screen bg-fundo text-texto">
    <div className="mx-auto max-w-[1500px] px-5 pb-20 pt-6 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borda pb-6">
        <div className="flex items-center gap-3"><Image src={temaAtual.tipo === 'escuro' ? '/imagens/wellbook/logo-claro.svg' : '/imagens/wellbook/logo-escuro.svg'} width={170} height={42} alt="Wellbook" priority className="h-10 w-auto"/><span className="border-l border-borda pl-3 text-[10px] font-semibold uppercase tracking-[.2em] text-texto-suave">Gestão da clínica</span></div>
        <div className="flex items-center gap-4"><span className="hidden text-sm text-texto-suave sm:inline">Painel da clínica</span><BotaoSair /></div>
      </header>
      <div className="mb-8 mt-9 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-primaria"><span className="h-px w-8 bg-primaria"/> Espaço de gestão</div><h1 className="font-serif text-5xl tracking-tight md:text-6xl">{dados.clinica.nome}<span className="text-primaria">.</span></h1><p className="mt-3 text-sm text-texto-suave">Tudo o que sua clínica precisa, em um só lugar.</p></div><div className="rounded-full border border-borda bg-superficie px-4 py-2 text-xs text-texto-suave">● {dados.clinica.ativo ? 'Clínica ativa' : 'Clínica desativada'}</div></div>
      <div className="mb-8 overflow-x-auto"><AbasFluidas itens={ABAS} valor={aba} aoMudar={mudarAba}/></div>
      {mensagem && <p role="status" className="mb-6 rounded-xl border border-borda bg-superficie-vitrine px-5 py-4 text-sm">{mensagem}</p>}
      {credencial && <div role="status" className="mb-6 rounded-2xl border border-primaria bg-superficie-vitrine p-5 text-sm"><strong>Conta de {credencial.nome} criada.</strong><p className="mt-2">Senha provisória (exibida uma vez): <code className="rounded bg-fundo px-2 py-1 font-mono">{credencial.senha}</code></p><p className="mt-2 text-texto-suave">Entregue a senha em particular. A troca será exigida no primeiro acesso.</p><button type="button" className="mt-3 text-primaria underline" onClick={() => setCredencial(null)}>Ocultar senha</button></div>}
      <motion.main key={aba} initial={reduzir ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduzir ? 0 : .32 }}>
        {aba === 'visao' && <><BordaAnimada className="mb-7"><div className="grid gap-7 p-7 md:grid-cols-[1.3fr_.7fr] md:p-10"><div><span className="text-xs font-semibold uppercase tracking-[.2em] text-primaria">Bem-vindo ao seu espaço</span><h2 className="mt-4 max-w-xl font-serif text-4xl leading-tight md:text-5xl">Uma experiência à altura da sua clínica.</h2><p className="mt-4 max-w-lg text-sm leading-7 text-texto-suave">Organize sua equipe, personalize a identidade e mantenha cada serviço em perfeita harmonia.</p><button type="button" onClick={() => mudarAba('clinica')} className={`${botao} mt-7`}>Personalizar clínica <ArrowRight size={16}/></button></div><div className="relative min-h-64 overflow-hidden rounded-3xl bg-superficie-vitrine"><Image src="/imagens/wellbook/recepcao-clinica.png" alt="Recepção acolhedora de uma clínica" fill sizes="(max-width: 768px) 100vw, 35vw" className="object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-fundo/85 via-transparent to-transparent"/><p className="absolute bottom-6 left-6 max-w-48 font-serif text-3xl leading-none text-texto">Cuidado em<br/>cada detalhe.</p></div></div></BordaAnimada>
          <div className="grid gap-4 md:grid-cols-3">{[{ rotulo: 'Profissionais ativos', valor: ativos.length, icone: <Users size={20}/>, destino: 'equipe' as Aba }, { rotulo: 'Serviços disponíveis', valor: servicosAtivos.length, icone: <Heart size={20}/>, destino: 'servicos' as Aba }, { rotulo: 'Próximos atendimentos', valor: futuros.length, icone: <CalendarDays size={20}/>, destino: 'agenda' as Aba }].map((item, i) => <motion.button key={item.rotulo} type="button" onClick={() => mudarAba(item.destino)} whileHover={reduzir ? undefined : { y: -5 }} transition={{ delay: reduzir ? 0 : i * .06 }} className="group rounded-3xl border border-borda bg-superficie p-6 text-left shadow-sm transition hover:shadow-lg"><span className="grid size-11 place-items-center rounded-2xl bg-superficie-vitrine text-primaria">{item.icone}</span><p className="mt-8 font-serif text-4xl">{item.valor.toString().padStart(2, '0')}</p><div className="mt-2 flex items-center justify-between text-sm text-texto-suave"><span>{item.rotulo}</span><ChevronRight size={16} className="transition-transform group-hover:translate-x-1"/></div></motion.button>)}</div>
          <div className="mt-8 rounded-3xl border border-borda bg-superficie p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primaria">Visão rápida</p><h2 className="mt-2 font-serif text-3xl">Próximos horários</h2></div><button type="button" onClick={() => mudarAba('agenda')} className="text-sm text-primaria hover:underline">Ver agenda →</button></div>{proximos.length ? <div className="mt-6 divide-y divide-borda">{proximos.map((a) => <div key={a.id} className="flex justify-between gap-4 py-4 text-sm"><span>{dados.profissionais.find((p) => p.id === a.profissional_id)?.nome ?? 'Profissional'}</span><time className="text-texto-suave">{new Date(a.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time></div>)}</div> : <p className="mt-6 text-sm text-texto-suave">Nenhum atendimento futuro encontrado.</p>}</div></>}
        {aba === 'clinica' && <div className="grid gap-7 xl:grid-cols-[1fr_1fr]"><section className="rounded-3xl border border-borda bg-superficie p-7"><TituloSecao etiqueta="Identidade" titulo="Dados da clínica" descricao="Informações usadas no perfil e nas regras de agendamento."/><form onSubmit={salvarClinica} className="mt-7 space-y-5"><Campo titulo="Nome da clínica"><input className={estiloCampo} maxLength={120} minLength={2} required value={formClinica.nome} onChange={(e) => setFormClinica({ ...formClinica, nome: e.target.value })}/></Campo><Campo titulo="WhatsApp"><input className={estiloCampo} inputMode="tel" placeholder="Somente números, com DDD" value={formClinica.whatsapp} onChange={(e) => setFormClinica({ ...formClinica, whatsapp: e.target.value })}/></Campo><Campo titulo="Endereço"><input className={estiloCampo} maxLength={300} value={formClinica.endereco} onChange={(e) => setFormClinica({ ...formClinica, endereco: e.target.value })}/></Campo><Campo titulo="Prazo de cancelamento do cliente (minutos)"><input className={estiloCampo} type="number" min={0} max={43200} value={formClinica.prazo} onChange={(e) => setFormClinica({ ...formClinica, prazo: e.target.value })}/></Campo><p className="text-xs text-texto-suave">0 permite cancelar ou remarcar sem antecedência mínima.</p><button disabled={ocupado} className={botao} type="submit">Salvar alterações <ArrowRight size={16}/></button></form></section><section className="space-y-7"><div className="rounded-3xl border border-borda bg-superficie p-7"><TituloSecao etiqueta="Assinatura visual" titulo="Logo da clínica" descricao="PNG, JPG ou WebP de até 2 MB."/><div className="mt-6 flex items-center gap-5"><div className="grid size-24 place-items-center overflow-hidden rounded-2xl border border-borda bg-superficie-vitrine">{dados.clinica.logo_url ? <img src={dados.clinica.logo_url} alt={`Logo de ${dados.clinica.nome}`} className="size-full object-contain"/> : <Sparkles size={30} className="text-primaria"/>}</div><label className={`${secundario} cursor-pointer`}><ImagePlus size={17}/> Enviar logo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void enviarLogo(e.target.files?.[0])}/></label></div></div><div className="rounded-3xl border border-borda bg-superficie p-7"><TituloSecao etiqueta="Estilo da clínica" titulo="Tema visual" descricao="Escolha um dos oito temas. Veja a prévia antes de aplicar."/><div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">{LISTA_TEMAS.map((tema) => <button key={tema.id} type="button" onClick={() => setTemaPreview(tema.id)} aria-pressed={temaPreview === tema.id} className={`rounded-xl border bg-fundo p-3 text-left text-xs text-texto transition hover:-translate-y-1 ${temaPreview === tema.id ? 'border-primaria ring-2 ring-primaria/20' : 'border-borda'}`} style={variaveisCss(tema.id) as CSSProperties}><span className="block h-10 rounded-lg bg-fundo p-2 text-primaria"><span className="block size-5 rounded-full bg-primaria"/></span><span className="mt-2 block text-texto">{tema.nome}</span></button>)}</div><div style={variaveisCss(temaPreview) as CSSProperties} className="mt-5 rounded-2xl border border-borda bg-fundo p-5 text-texto"><p className="text-xs uppercase tracking-widest text-texto-suave">Prévia ao vivo</p><p className="mt-3 font-serif text-2xl">{dados.clinica.nome}</p><button type="button" className="mt-4 rounded-lg bg-primaria px-4 py-2 text-sm text-texto-sobre-primaria">Agendar horário</button></div><button type="button" disabled={ocupado || temaPreview === dados.clinica.tema} onClick={() => void salvarTema()} className={`${botao} mt-5`}>Aplicar tema <Check size={16}/></button></div></section></div>}
        {aba === 'equipe' && <section><div className="flex flex-wrap items-end justify-between gap-4"><TituloSecao etiqueta="Pessoas" titulo="Profissionais" descricao="Especialidades, repasses e serviços de quem atende na clínica."/><button type="button" onClick={() => { setCredencial(null); setModal('novoProfissional'); }} className={botao}><Plus size={17}/> Novo profissional</button>{!dados.profissionais.some((p) => p.usuario_id === dados.usuarioId) && <button type="button" onClick={() => void adicionarAdminComoProfissional()} disabled={ocupado} className={secundario}><Plus size={17}/> Eu também atendo</button>}</div><div className="mt-7 grid gap-4 lg:grid-cols-2">{dados.profissionais.map((p) => <motion.article whileHover={reduzir ? undefined : { y: -4 }} key={p.id} className="rounded-3xl border border-borda bg-superficie p-6 shadow-sm"><div className="flex items-start gap-4"><div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-superficie-vitrine font-serif text-2xl text-primaria">{p.avatar_url ? <img src={p.avatar_url} alt="" className="size-full object-cover"/> : p.nome.charAt(0)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="font-serif text-2xl">{p.nome}</h3><p className="text-sm text-texto-suave">{p.especialidade}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${p.ativo ? 'bg-superficie-vitrine text-primaria' : 'bg-fundo text-texto-suave'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span></div><p className="mt-5 text-xs uppercase tracking-widest text-texto-suave">Repasse da clínica <strong className="ml-2 text-base tracking-normal text-texto">{(p.percentual_repasse / 100).toFixed(2).replace('.', ',')}%</strong></p></div></div><div className="mt-5 border-t border-borda pt-5"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-texto-suave">Serviços vinculados</p><div className="flex flex-wrap gap-2">{dados.servicos.filter((s) => s.ativo).map((s) => { const vinculado = dados.vinculos.some((v) => v.profissional_id === p.id && v.servico_id === s.id); return <button key={s.id} type="button" disabled={ocupado} onClick={() => void alternarVinculo(p.id, s.id)} aria-pressed={vinculado} className={`rounded-full border px-3 py-1.5 text-xs transition ${vinculado ? 'border-primaria bg-superficie-vitrine text-primaria' : 'border-borda text-texto-suave hover:border-primaria'}`}>{vinculado ? '✓ ' : '+ '}{s.nome}</button>; })}</div></div><div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={() => abrirProfissional(p)} className={secundario}>Editar dados</button>{p.ativo ? <button type="button" onClick={() => { setEdicaoProfissional(p); setContagemDesativacao(null); setModal('desativar'); }} className="text-sm text-texto-suave hover:underline">Desativar</button> : <button type="button" disabled={ocupado} onClick={() => void reativarProfissional(p)} className="text-sm text-primaria hover:underline">Reativar</button>}<button type="button" disabled={ocupado} onClick={() => void abrirExclusaoProfissional(p)} className="text-sm text-texto-suave hover:underline">Remover</button></div></motion.article>)}</div>{!dados.profissionais.length && <Vazio texto="Nenhum profissional cadastrado ainda."/>}<p className="mt-6 max-w-2xl text-sm text-texto-suave">A nova conta recebe uma senha provisória que deve ser entregue em particular.</p></section>}
        {aba === 'servicos' && <section><div className="flex flex-wrap items-end justify-between gap-4"><TituloSecao etiqueta="Catálogo" titulo="Serviços" descricao="Crie uma oferta clara, com duração e preço definidos."/><button type="button" onClick={() => abrirServico()} className={botao}><Plus size={18}/> Novo serviço</button></div><div className="mt-7 grid gap-4 lg:grid-cols-2">{dados.servicos.map((s) => <motion.article whileHover={reduzir ? undefined : { y: -4 }} key={s.id} className="rounded-3xl border border-borda bg-superficie p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-superficie-vitrine text-primaria"><Scissors size={20}/></span><span className="text-xs text-texto-suave">{s.ativo ? 'Disponível' : 'Inativo'}</span></div><h3 className="mt-7 font-serif text-3xl">{s.nome}</h3><div className="mt-3 flex items-center gap-4 text-sm text-texto-suave"><span className="flex items-center gap-1"><Clock3 size={15}/>{s.duracao_min} min</span><span className="flex items-center gap-1"><Wallet size={15}/>{formatarReais(s.preco)}</span></div><div className="mt-6 flex flex-wrap gap-4 border-t border-borda pt-5"><button type="button" onClick={() => abrirServico(s)} className="text-sm font-medium text-primaria hover:underline">Editar serviço</button><button type="button" disabled={ocupado} onClick={() => void alternarServico(s)} className="text-sm text-texto-suave hover:underline">{s.ativo ? 'Desativar' : 'Reativar'}</button><button type="button" disabled={ocupado} onClick={() => void abrirExclusaoServico(s)} className="text-sm text-texto-suave hover:underline">Excluir</button></div></motion.article>)}</div>{!dados.servicos.length && <Vazio texto="Nenhum serviço cadastrado. Comece pelo primeiro."/>}</section>}
        {aba === 'agenda' && <section><TituloSecao etiqueta="Somente leitura" titulo="Agenda da equipe" descricao="Os profissionais administram seus próprios horários e bloqueios. Aqui você acompanha a disponibilidade."/><div className="mt-7 grid gap-4 lg:grid-cols-2">{dados.profissionais.map((p) => <div key={p.id} className="rounded-3xl border border-borda bg-superficie p-6"><h3 className="font-serif text-2xl">{p.nome}</h3><p className="mt-1 text-sm text-texto-suave">{p.especialidade}</p><div className="mt-5 space-y-2 border-t border-borda pt-5 text-sm">{dados.horarios.filter((h) => h.profissional_id === p.id).map((h) => <p key={h.id} className="flex justify-between"><span>{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][h.dia_semana] ?? `Dia ${h.dia_semana}`}</span><span className="text-texto-suave">{h.hora_inicio.slice(0,5)}–{h.hora_fim.slice(0,5)}</span></p>)}{!dados.horarios.some((h) => h.profissional_id === p.id) && <p className="text-texto-suave">Sem horários definidos.</p>}</div><p className="mt-5 text-xs text-texto-suave">{dados.bloqueios.filter((b) => b.profissional_id === p.id).length} bloqueio(s) futuro(s) · {dados.agendamentos.filter((a) => a.profissional_id === p.id && a.status === 'AGENDADO').length} atendimento(s) agendado(s)</p></div>)}</div><ListaAgenda agendamentos={dados.agendamentos} profissionais={dados.profissionais}/></section>}
      </motion.main>
      <footer className="mt-16 border-t border-borda pt-6 text-xs text-texto-suave">Wellbook · Gestão feita com cuidado</footer>
    </div>
    <ModalAnimado aberto={modal === 'servico'} titulo={edicaoServico ? 'Editar serviço' : 'Novo serviço'} aoFechar={() => setModal(null)}><form onSubmit={salvarServico} className="space-y-5"><Campo titulo="Nome"><input className={estiloCampo} required minLength={2} maxLength={120} value={formServico.nome} onChange={(e) => setFormServico({ ...formServico, nome: e.target.value })}/></Campo><div className="grid gap-4 sm:grid-cols-2"><Campo titulo="Duração (minutos)"><input className={estiloCampo} type="number" min={5} max={720} required value={formServico.duracao} onChange={(e) => setFormServico({ ...formServico, duracao: e.target.value })}/></Campo><Campo titulo="Preço (R$)"><input className={estiloCampo} inputMode="decimal" placeholder="150,00" required value={formServico.preco} onChange={(e) => setFormServico({ ...formServico, preco: e.target.value })}/></Campo></div><button className={botao} disabled={ocupado} type="submit">Salvar serviço <ArrowRight size={16}/></button></form></ModalAnimado>
    <ModalAnimado aberto={modal === 'excluirServico'} titulo="Excluir serviço?" aoFechar={() => setModal(null)}>
      <p className="text-sm leading-6 text-texto-suave">O serviço <strong className="text-texto">{edicaoServico?.nome}</strong> não tem histórico de atendimentos. Esta exclusão também remove os vínculos com profissionais.</p>
      <div className="mt-6 flex gap-3"><button type="button" onClick={() => setModal(null)} className={secundario}>Voltar</button><button type="button" disabled={ocupado} onClick={() => void excluirServico()} className={botao}>Excluir serviço</button></div>
    </ModalAnimado>
    <ModalAnimado aberto={modal === 'novoProfissional'} titulo="Novo profissional" aoFechar={() => setModal(null)}>
      <form onSubmit={criarProfissional} className="space-y-4">
        <Campo titulo="Nome completo"><input className={estiloCampo} required minLength={2} maxLength={120} autoComplete="name" value={formNovo.nome} onChange={(e) => setFormNovo({ ...formNovo, nome: e.target.value })}/></Campo>
        <Campo titulo="E-mail"><input className={estiloCampo} required type="email" autoComplete="email" value={formNovo.email} onChange={(e) => setFormNovo({ ...formNovo, email: e.target.value })}/></Campo>
        <Campo titulo="Telefone com DDD"><input className={estiloCampo} inputMode="tel" value={formNovo.telefone} onChange={(e) => setFormNovo({ ...formNovo, telefone: e.target.value })}/></Campo>
        <Campo titulo="Especialidade"><input className={estiloCampo} required minLength={2} maxLength={80} value={formNovo.especialidade} onChange={(e) => setFormNovo({ ...formNovo, especialidade: e.target.value })}/></Campo>
        <Campo titulo="Repasse da clínica (%)"><input className={estiloCampo} required inputMode="decimal" value={formNovo.percentual} onChange={(e) => setFormNovo({ ...formNovo, percentual: e.target.value })}/></Campo>
        <p className="text-xs text-texto-suave">Uma senha provisória será gerada e mostrada apenas após o cadastro.</p>
        <button type="submit" disabled={ocupado} className={botao}>Criar conta <ArrowRight size={16}/></button>
      </form>
    </ModalAnimado>
    <ModalAnimado aberto={modal === 'profissional'} titulo="Editar profissional" aoFechar={() => setModal(null)}>
      <form onSubmit={salvarProfissional} className="space-y-5">
        <p className="text-sm text-texto-suave">{edicaoProfissional?.nome}</p>
        <Campo titulo="Especialidade"><input className={estiloCampo} required minLength={2} maxLength={80} value={formProfissional.especialidade} onChange={(e) => setFormProfissional({ ...formProfissional, especialidade: e.target.value })}/></Campo>
        <Campo titulo="Repasse da clínica (%)"><input className={estiloCampo} inputMode="decimal" value={formProfissional.percentual} onChange={(e) => setFormProfissional({ ...formProfissional, percentual: e.target.value })}/></Campo>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-primaria"><ImagePlus size={18}/> Atualizar foto (PNG, JPG ou WebP, até 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void enviarAvatar(e.target.files?.[0])}/></label>
        <button className={botao} disabled={ocupado} type="submit">Salvar profissional <ArrowRight size={16}/></button>
      </form>
    </ModalAnimado>
    <ModalAnimado aberto={modal === 'desativar'} titulo="Desativar profissional?" aoFechar={() => setModal(null)}>
      <p className="text-sm leading-7 text-texto-suave"><strong className="text-texto">{edicaoProfissional?.nome}</strong> deixará de aparecer na equipe. <strong className="text-texto">{contagemDesativacao === null ? 'Verificando agendamentos…' : `${contagemDesativacao} agendamento(s) em aberto`}</strong> serão cancelados automaticamente pelo banco. A reativação não restaura esses agendamentos.</p>
      <div className="mt-7 flex gap-3"><button type="button" onClick={() => setModal(null)} className={secundario}>Voltar</button><button type="button" disabled={ocupado || contagemDesativacao === null} onClick={() => void desativarProfissional()} className={botao}>Confirmar desativação</button></div>
    </ModalAnimado>
    <ModalAnimado aberto={modal === 'excluirProfissional'} titulo="Remover profissional?" aoFechar={() => setModal(null)}>
      <p className="text-sm leading-6 text-texto-suave"><strong className="text-texto">{edicaoProfissional?.nome}</strong> não possui histórico de atendimentos. O vínculo com a clínica, os horários e os serviços serão removidos. A conta de usuário continuará ativa.</p>
      <div className="mt-6 flex gap-3"><button type="button" onClick={() => setModal(null)} className={secundario}>Voltar</button><button type="button" disabled={ocupado} onClick={() => void excluirProfissional()} className={botao}>Remover da clínica</button></div>
    </ModalAnimado>
  </div>;
}

function TituloSecao({ etiqueta, titulo, descricao }: { etiqueta: string; titulo: string; descricao: string }) { return <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primaria">{etiqueta}</p><h2 className="mt-2 font-serif text-4xl">{titulo}</h2><p className="mt-3 text-sm leading-6 text-texto-suave">{descricao}</p></div>; }
function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-texto">{titulo}{children}</label>; }
function Vazio({ texto }: { texto: string }) { return <div className="mt-6 rounded-3xl border border-dashed border-borda p-12 text-center text-sm text-texto-suave">{texto}</div>; }

function ListaAgenda({ agendamentos, profissionais }: { agendamentos: Agendamento[]; profissionais: Profissional[] }) {
  return <div className="mt-8 rounded-3xl border border-borda bg-superficie p-7">
    <h3 className="font-serif text-3xl">Atendimentos</h3>
    <p className="mt-2 text-sm text-texto-suave">Nome e telefone para acolhimento na recepção. A agenda é administrada pelo profissional.</p>
    <div className="mt-6 divide-y divide-borda">
      {agendamentos.map((a) => <article key={a.id} className="grid gap-3 py-5 md:grid-cols-[150px_1fr_auto] md:items-center">
        <time className="text-sm font-medium">{new Date(a.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time>
        <div><p className="font-medium">{a.cliente_nome}</p><p className="mt-1 text-sm text-texto-suave">{profissionais.find((p) => p.id === a.profissional_id)?.nome ?? 'Profissional'} · {a.servicos.join(', ') || 'Serviço'}</p>{a.cliente_telefone && <a href={`tel:${a.cliente_telefone}`} className="mt-1 inline-block text-sm text-primaria hover:underline">{a.cliente_telefone}</a>}</div>
        <span className="w-fit rounded-full px-3 py-1 text-xs font-semibold" style={{ background: CORES_STATUS[a.status].fundo, color: CORES_STATUS[a.status].texto }}>{CORES_STATUS[a.status].rotulo}</span>
      </article>)}
      {!agendamentos.length && <p className="py-6 text-sm text-texto-suave">Nenhum atendimento recente ou futuro.</p>}
    </div>
  </div>;
}
