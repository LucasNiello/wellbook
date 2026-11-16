'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  esquemaCadastro,
  esquemaCadastroEmpresa,
  parametrosCadastrarEmpresa,
  primeiraMensagem,
  ROTA_DO_PAPEL,
  traduzirErroAuth,
  traduzirErroBanco,
} from '@wellbook/shared';
import { criarClienteNavegador } from '../../lib/supabase/navegador';
import { CamposEmpresa, lerCamposEmpresa } from '../../components/CamposEmpresa';
import { Aviso, BotaoPrimario, BotoesSociais, CartaoAuth, Campo, LinkTexto } from '../../components/ui';

type Porta = 'cliente' | 'empresa';

/**
 * D28: cadastro com 2 portas, Cliente e Empresa. O profissional não se cadastra sozinho: o admin
 * cria a conta dele. RF01 + RNF05 + D32: as duas portas exigem o consentimento LGPD.
 */
export default function PaginaCadastro() {
  const router = useRouter();
  const [porta, setPorta] = useState<Porta>('cliente');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const d = new FormData(evento.currentTarget);
    const pessoa = {
      nome: d.get('nome'),
      email: d.get('email'),
      telefone: d.get('telefone'),
      senha: d.get('senha'),
      confirmacaoSenha: d.get('confirmacaoSenha'),
      consentimentoLgpd: d.get('consentimentoLgpd') === 'on',
    };
    const r = esquemaCadastro.safeParse(pessoa);
    const rEmpresa = porta === 'empresa' ? esquemaCadastroEmpresa.safeParse({ ...pessoa, ...lerCamposEmpresa(d) }) : null;
    if (!r.success) return setErro(primeiraMensagem(r.error));
    if (rEmpresa && !rEmpresa.success) return setErro(primeiraMensagem(rEmpresa.error));
    const empresa = rEmpresa?.data ?? null;
    setCarregando(true);
    setErro(null);
    setOk(null);
    const supabase = criarClienteNavegador();
    // O gatilho do banco cria a linha em `usuarios` com nome e telefone destes metadados e grava
    // consentimento_lgpd_em = now() (relógio do servidor) quando consentimento_lgpd é true (RNF05, DP2).
    const { data, error } = await supabase.auth.signUp({
      email: r.data.email,
      password: r.data.senha,
      options: {
        data: { nome: r.data.nome, telefone: r.data.telefone, consentimento_lgpd: r.data.consentimentoLgpd },
      },
    });
    if (error) {
      setCarregando(false);
      return setErro(traduzirErroAuth(error.message));
    }
    if (!data.session) {
      // Se a confirmação de e-mail estiver ligada no painel, não há sessão ainda.
      setCarregando(false);
      return setOk(
        porta === 'cliente'
          ? 'Conta criada. Confira seu e-mail para confirmar e depois entre.'
          : 'Conta criada. Confirme o e-mail, entre e use "Abrir minha empresa" em Minha conta.',
      );
    }
    if (!empresa) {
      router.replace(ROTA_DO_PAPEL.cliente); // D21/D42: lista de clínicas
      router.refresh();
      return;
    }
    // D29: a empresa é criada no servidor; quem cadastra vira admin (e profissional no modo sozinho).
    const { error: erroEmpresa } = await supabase.rpc('cadastrar_empresa', parametrosCadastrarEmpresa(empresa));
    if (erroEmpresa) {
      setCarregando(false);
      return setErro(
        `${traduzirErroBanco(erroEmpresa)} Sua conta foi criada como cliente; você pode tentar de novo em Minha conta.`,
      );
    }
    router.replace(ROTA_DO_PAPEL.admin);
    router.refresh();
  }

  const abas: readonly { id: Porta; titulo: string }[] = [
    { id: 'cliente', titulo: 'Sou cliente' },
    { id: 'empresa', titulo: 'Tenho uma empresa' },
  ];

  return (
    <CartaoAuth
      titulo="Criar conta"
      descricao={
        porta === 'cliente'
          ? 'Crie sua conta de cliente para agendar e acompanhar seus atendimentos.'
          : 'Cadastre sua clínica, estúdio ou atendimento autônomo. Você será o administrador.'
      }
      rodape={
        <>
          <p>
            Já tem conta? <LinkTexto href="/entrar">Entrar</LinkTexto>
          </p>
          <p className="mt-2 text-xs">
            É profissional de uma clínica? Sua conta é criada pelo administrador da clínica.
          </p>
        </>
      }
    >
      <div role="tablist" aria-label="Tipo de cadastro" className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-borda p-1">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={porta === a.id}
            onClick={() => {
              setPorta(a.id);
              setErro(null);
              setOk(null);
            }}
            className={`min-h-11 rounded-xl px-3 text-sm font-medium transition ${
              porta === a.id ? 'bg-primaria text-texto-sobre-primaria' : 'text-texto-suave hover:text-texto'
            }`}
          >
            {a.titulo}
          </button>
        ))}
      </div>
      <form onSubmit={enviar} noValidate>
        <Aviso texto={erro} />
        <Aviso texto={ok} tipo="ok" />
        <Campo rotulo={porta === 'cliente' ? 'Nome' : 'Seu nome'} id="nome" autoComplete="name" required />
        <Campo rotulo="E-mail" id="email" type="email" autoComplete="email" required />
        <Campo rotulo="Telefone (com DDD)" id="telefone" type="tel" autoComplete="tel" required />
        <Campo rotulo="Senha (mínimo 8 caracteres)" id="senha" type="password" autoComplete="new-password" required />
        <Campo rotulo="Confirme a senha" id="confirmacaoSenha" type="password" autoComplete="new-password" required />
        {porta === 'empresa' && <CamposEmpresa />}
        <label className="mb-4 flex items-start gap-2 text-sm text-texto">
          <input type="checkbox" name="consentimentoLgpd" className="mt-1 accent-primaria" required />
          <span>
            Li e aceito a <LinkTexto href="/privacidade">política de privacidade</LinkTexto> e autorizo o uso dos
            meus dados para agendamentos.
          </span>
        </label>
        <BotaoPrimario carregando={carregando}>{porta === 'cliente' ? 'Criar conta' : 'Criar conta e empresa'}</BotaoPrimario>
      </form>
      <BotoesSociais />
    </CartaoAuth>
  );
}
