'use client';

import Image from 'next/image';
import { useMemo, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Building2, Plus, Search } from 'lucide-react';
import { criarClienteNavegador } from '../lib/supabase/navegador';
import { erroFuncao } from '../lib/erro-funcao';
import { BotaoSair } from './BotaoSair';
import { BordaAnimada } from './animata/BordaAnimada';
import { ModalAnimado } from './animata/ModalAnimado';

type Clinica = { id: string; nome: string; slug: string; tema: string; ativo: boolean; criado_em: string };
const campo = 'mt-2 w-full rounded-xl border border-borda bg-fundo px-4 py-3 text-sm outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/15';
const botao = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primaria px-5 py-2.5 text-sm font-semibold text-texto-sobre-primaria transition hover:bg-primaria-pressionada disabled:opacity-50';

export function PainelPlataforma({ clinicasIniciais }: { clinicasIniciais: Clinica[] }) {
  const [clinicas, setClinicas] = useState(clinicasIniciais);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<Clinica | null>(null);
  const [clinicaAdmin, setClinicaAdmin] = useState<Clinica | null>(null);
  const [formAdmin, setFormAdmin] = useState({ nome: '', email: '', telefone: '' });
  const [credencial, setCredencial] = useState<{ nome: string; senha: string } | null>(null);
  const [form, setForm] = useState({ nome: '', slug: '' });
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const reduzir = useReducedMotion();
  const supabase = useMemo(criarClienteNavegador, []);
  const exibidas = clinicas.filter((c) => `${c.nome} ${c.slug}`.toLowerCase().includes(busca.toLowerCase()));
  function abrirNovo() { setEdicao(null); setForm({ nome: '', slug: '' }); setModal(true); }
  function abrirEdicao(clinica: Clinica) { setEdicao(clinica); setForm({ nome: clinica.nome, slug: clinica.slug }); setModal(true); }
  async function salvar(evento: FormEvent) {
    evento.preventDefault(); setOcupado(true); setMensagem('');
    try {
      const valores = { nome: form.nome.trim(), slug: form.slug.trim().toLowerCase() };
      const consulta = edicao ? supabase.from('tenants').update(valores).eq('id', edicao.id) : supabase.from('tenants').insert(valores);
      const { data, error } = await consulta.select('id,nome,slug,tema,ativo,criado_em').single();
      if (error) throw error;
      if (data) setClinicas((atual) => edicao ? atual.map((c) => c.id === data.id ? data : c) : [data, ...atual]);
      setModal(false); setForm({ nome: '', slug: '' }); setMensagem(edicao ? 'Clínica atualizada.' : 'Clínica cadastrada. Use “Criar admin” no cartão da clínica para configurar o acesso.');
    } catch (e) { setMensagem(e instanceof Error ? e.message : 'Não foi possível criar a clínica.'); }
    finally { setOcupado(false); }
  }
  async function alternar(clinica: Clinica) {
    setOcupado(true); setMensagem('');
    const { error } = await supabase.from('tenants').update({ ativo: !clinica.ativo }).eq('id', clinica.id);
    if (error) setMensagem(error.message);
    else { setClinicas((atual) => atual.map((c) => c.id === clinica.id ? { ...c, ativo: !c.ativo } : c)); setMensagem(clinica.ativo ? 'Clínica desativada. Os agendamentos existentes foram mantidos.' : 'Clínica reativada.'); }
    setOcupado(false);
  }
  async function criarAdmin(evento: FormEvent) {
    evento.preventDefault(); if (!clinicaAdmin) return;
    setOcupado(true); setMensagem('');
    try {
      const { data, error } = await supabase.functions.invoke('criar-conta-equipe', { body: {
        tipo: 'admin', tenantId: clinicaAdmin.id, nome: formAdmin.nome.trim(), email: formAdmin.email.trim(), telefone: formAdmin.telefone,
      } });
      if (error) throw await erroFuncao(error);
      if (!data?.senhaProvisoria) throw new Error('Resposta incompleta da função de cadastro.');
      setCredencial({ nome: formAdmin.nome.trim(), senha: data.senhaProvisoria });
      setClinicaAdmin(null); setFormAdmin({ nome: '', email: '', telefone: '' });
    } catch (e) { setMensagem(e instanceof Error ? e.message : 'Não foi possível criar o administrador.'); }
    finally { setOcupado(false); }
  }
  return <div className="min-h-screen bg-fundo text-texto"><div className="mx-auto max-w-7xl px-5 pb-20 pt-6 md:px-10"><header className="flex items-center justify-between border-b border-borda pb-6"><div className="flex items-center gap-3"><Image src="/imagens/wellbook/logo-escuro.svg" width={170} height={42} alt="Wellbook" priority className="h-10 w-auto"/><span className="border-l border-borda pl-3 text-[10px] font-semibold uppercase tracking-[.2em] text-texto-suave">Plataforma</span></div><BotaoSair/></header>
    <div className="mb-8 mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primaria">Gestão da plataforma</p><h1 className="mt-3 font-serif text-5xl md:text-6xl">Clínicas<span className="text-primaria">.</span></h1><p className="mt-3 text-sm text-texto-suave">Uma visão clara de cada espaço da Wellbook.</p></div><button type="button" onClick={abrirNovo} className={botao}><Plus size={18}/> Nova clínica</button></div>
    <BordaAnimada><div className="flex flex-wrap items-center justify-between gap-6 p-7 md:p-9"><div><p className="text-xs uppercase tracking-widest text-primaria">Ecossistema Wellbook</p><h2 className="mt-3 font-serif text-3xl">Cada clínica, uma identidade.</h2><p className="mt-2 text-sm text-texto-suave">Administre os espaços sem acessar os dados de atendimento.</p></div><div className="flex gap-7"><div><strong className="font-serif text-4xl">{clinicas.length.toString().padStart(2, '0')}</strong><p className="text-xs text-texto-suave">Clínicas</p></div><div><strong className="font-serif text-4xl">{clinicas.filter((c) => c.ativo).length.toString().padStart(2, '0')}</strong><p className="text-xs text-texto-suave">Ativas</p></div></div></div></BordaAnimada>
    {mensagem && <p role="status" className="mt-6 rounded-xl border border-borda bg-superficie-vitrine p-4 text-sm">{mensagem}</p>}
    {credencial && <div role="status" className="mt-6 rounded-xl border border-primaria bg-superficie-vitrine p-5 text-sm"><strong>Administrador {credencial.nome} criado.</strong><p className="mt-2">Senha provisória (exibida uma vez): <code className="rounded bg-fundo px-2 py-1 font-mono">{credencial.senha}</code></p><p className="mt-2 text-texto-suave">Entregue a senha em particular. A troca será exigida no primeiro acesso.</p><button type="button" className="mt-3 text-primaria underline" onClick={() => setCredencial(null)}>Ocultar senha</button></div>}
    <div className="mt-9 flex flex-wrap items-center justify-between gap-4"><h2 className="font-serif text-3xl">Todos os espaços</h2><label className="flex items-center gap-2 rounded-xl border border-borda bg-superficie px-4 py-2"><Search size={17} className="text-texto-suave"/><span className="sr-only">Buscar clínica</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar clínica" className="min-h-8 bg-transparent text-sm outline-none"/></label></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{exibidas.map((c) => <motion.article key={c.id} whileHover={reduzir ? undefined : { y: -4 }} className="rounded-3xl border border-borda bg-superficie p-6 shadow-sm"><div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-superficie-vitrine text-primaria"><Building2 size={22}/></span><span className="rounded-full border border-borda px-3 py-1 text-xs text-texto-suave">{c.ativo ? 'Ativa' : 'Inativa'}</span></div><h3 className="mt-7 font-serif text-3xl">{c.nome}</h3><p className="mt-1 text-sm text-texto-suave">/{c.slug} · Tema {c.tema}</p><div className="mt-6 flex items-center justify-between border-t border-borda pt-5"><span className="text-xs text-texto-suave">Desde {new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>{c.ativo && <button type="button" onClick={() => { setCredencial(null); setClinicaAdmin(c); }} className="text-sm text-primaria hover:underline">Criar admin</button>}<button type="button" onClick={() => abrirEdicao(c)} className="text-sm text-texto-suave hover:underline">Editar</button><button type="button" disabled={ocupado} onClick={() => void alternar(c)} className="flex items-center gap-1 text-sm font-medium text-primaria hover:underline">{c.ativo ? 'Desativar' : 'Reativar'} <ArrowRight size={15}/></button></div></motion.article>)}</div>{!exibidas.length && <div className="mt-5 rounded-3xl border border-dashed border-borda p-12 text-center text-sm text-texto-suave">Nenhuma clínica encontrada.</div>}
  </div><ModalAnimado aberto={modal} titulo={edicao ? "Editar clínica" : "Nova clínica"} aoFechar={() => setModal(false)}><form onSubmit={salvar} className="space-y-5"><label className="block text-sm">Nome<input className={campo} minLength={2} maxLength={120} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}/></label><label className="block text-sm">Identificador para o link<input className={campo} pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} placeholder="nome-da-clinica" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}/></label><p className="text-xs leading-5 text-texto-suave">Depois de salvar, use “Criar admin” no cartão da clínica.</p><button type="submit" disabled={ocupado} className={botao}>{edicao ? "Salvar clínica" : "Criar clínica"} <ArrowRight size={16}/></button></form></ModalAnimado>
  <ModalAnimado aberto={clinicaAdmin !== null} titulo="Novo administrador" aoFechar={() => setClinicaAdmin(null)}>
    <form onSubmit={criarAdmin} className="space-y-5">
      <p className="text-sm text-texto-suave">Clínica: {clinicaAdmin?.nome}</p>
      <label className="block text-sm">Nome completo<input className={campo} minLength={2} maxLength={120} required autoComplete="name" value={formAdmin.nome} onChange={(e) => setFormAdmin({ ...formAdmin, nome: e.target.value })}/></label>
      <label className="block text-sm">E-mail<input className={campo} type="email" required autoComplete="email" value={formAdmin.email} onChange={(e) => setFormAdmin({ ...formAdmin, email: e.target.value })}/></label>
      <label className="block text-sm">Telefone com DDD<input className={campo} inputMode="tel" value={formAdmin.telefone} onChange={(e) => setFormAdmin({ ...formAdmin, telefone: e.target.value })}/></label>
      <p className="text-xs text-texto-suave">Uma senha provisória será gerada e exibida após o cadastro.</p>
      <button type="submit" disabled={ocupado} className={botao}>Criar administrador <ArrowRight size={16}/></button>
    </form>
  </ModalAnimado></div>;
}
