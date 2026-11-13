'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { esquemaCadastro, primeiraMensagem, traduzirErroAuth } from '@wellbook/shared';
import { criarClienteNavegador } from '../../lib/supabase/navegador';
import { Aviso, BotaoPrimario, BotoesSociais, CartaoAuth, Campo, LinkTexto } from '../../components/ui';

/** RF01 + RNF05: cadastro do cliente com consentimento LGPD explícito. */
export default function PaginaCadastro() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const d = new FormData(evento.currentTarget);
    const r = esquemaCadastro.safeParse({
      nome: d.get('nome'),
      email: d.get('email'),
      telefone: d.get('telefone'),
      senha: d.get('senha'),
      confirmacaoSenha: d.get('confirmacaoSenha'),
      consentimentoLgpd: d.get('consentimentoLgpd') === 'on',
    });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setCarregando(true);
    setErro(null);
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
    if (data.session) {
      router.replace('/conta');
      router.refresh();
      return;
    }
    // Se a confirmação de e-mail estiver ligada no painel, não há sessão ainda.
    setCarregando(false);
    setOk('Conta criada. Confira seu e-mail para confirmar e depois entre.');
  }

  return (
    <CartaoAuth
      titulo="Criar conta"
      descricao="Crie sua conta de cliente para acompanhar sua jornada de cuidado em um só lugar."
      rodape={
        <p>
          Já tem conta? <LinkTexto href="/entrar">Entrar</LinkTexto>
        </p>
      }
    >
      <form onSubmit={enviar} noValidate>
        <Aviso texto={erro} />
        <Aviso texto={ok} tipo="ok" />
        <Campo rotulo="Nome" id="nome" autoComplete="name" required />
        <Campo rotulo="E-mail" id="email" type="email" autoComplete="email" required />
        <Campo rotulo="Telefone (com DDD)" id="telefone" type="tel" autoComplete="tel" required />
        <Campo rotulo="Senha (mínimo 8 caracteres)" id="senha" type="password" autoComplete="new-password" required />
        <Campo rotulo="Confirme a senha" id="confirmacaoSenha" type="password" autoComplete="new-password" required />
        <label className="mb-4 flex items-start gap-2 text-sm text-texto">
          <input type="checkbox" name="consentimentoLgpd" className="mt-1 accent-primaria" required />
          <span>
            Li e aceito a <LinkTexto href="/privacidade">política de privacidade</LinkTexto> e autorizo o uso dos
            meus dados para agendamentos.
          </span>
        </label>
        <BotaoPrimario carregando={carregando}>Criar conta</BotaoPrimario>
      </form>
      <BotoesSociais />
    </CartaoAuth>
  );
}
