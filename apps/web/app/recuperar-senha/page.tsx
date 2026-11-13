'use client';

import { useState, type FormEvent } from 'react';
import { esquemaRecuperarSenha, primeiraMensagem } from '@wellbook/shared';
import { criarClienteNavegador } from '../../lib/supabase/navegador';
import { Aviso, BotaoPrimario, CartaoAuth, Campo, LinkTexto } from '../../components/ui';

/** RF05: recuperação de senha por e-mail. A resposta é sempre a mesma (não revela se o e-mail existe). */
export default function PaginaRecuperarSenha() {
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const r = esquemaRecuperarSenha.safeParse({ email: new FormData(evento.currentTarget).get('email') });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setCarregando(true);
    setErro(null);
    await criarClienteNavegador().auth.resetPasswordForEmail(r.data.email, {
      redirectTo: `${window.location.origin}/auth/callback?proxima=/redefinir-senha`,
    });
    setCarregando(false);
    setOk('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.');
  }

  return (
    <CartaoAuth
      titulo="Recuperar senha"
      descricao="Informe seu e-mail. Se houver uma conta, enviaremos um link para você criar uma nova senha."
      rodape={
        <p>
          <LinkTexto href="/entrar">Voltar para o login</LinkTexto>
        </p>
      }
    >
      <form onSubmit={enviar} noValidate>
        <Aviso texto={erro} />
        <Aviso texto={ok} tipo="ok" />
        <Campo rotulo="E-mail" id="email" type="email" autoComplete="email" required />
        <BotaoPrimario carregando={carregando}>Enviar link</BotaoPrimario>
      </form>
    </CartaoAuth>
  );
}
