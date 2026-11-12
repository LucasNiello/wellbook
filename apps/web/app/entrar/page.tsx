'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { destinoSeguro, esquemaLogin, primeiraMensagem, traduzirErroAuth } from '@wellbook/shared';
import { criarClienteNavegador } from '../../lib/supabase/navegador';
import { Aviso, BotaoPrimario, BotoesSociais, CartaoAuth, Campo, LinkTexto } from '../../components/ui';

/** RF02: login com e-mail e senha. Depois do login, o proxy decide a rota (papel e troca obrigatória). */
function FormularioEntrar() {
  const router = useRouter();
  const parametros = useSearchParams();
  const [erro, setErro] = useState<string | null>(
    parametros.get('erro') === 'link-invalido'
      ? 'O link expirou ou já foi usado. Peça outro.'
      : parametros.get('erro') === 'perfil'
        ? 'Não foi possível carregar seu perfil. Entre de novo.'
        : null,
  );
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const r = esquemaLogin.safeParse({ email: dados.get('email'), senha: dados.get('senha') });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setCarregando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().auth.signInWithPassword({
      email: r.data.email,
      password: r.data.senha,
    });
    setCarregando(false);
    if (error) return setErro(traduzirErroAuth(error.message));
    // O proxy redireciona para /trocar-senha (D20) ou para a área do papel, se for o caso.
    router.replace(destinoSeguro(parametros.get('proxima'), '/entrar'));
    router.refresh();
  }

  return (
    <CartaoAuth
      titulo="Entrar"
      rodape={
        <>
          <p>
            Não tem conta? <LinkTexto href="/cadastro">Cadastre-se</LinkTexto>
          </p>
          <p>
            <LinkTexto href="/recuperar-senha">Esqueci minha senha</LinkTexto>
          </p>
        </>
      }
    >
      <form onSubmit={enviar} noValidate>
        <Aviso texto={erro} />
        <Campo rotulo="E-mail" id="email" type="email" autoComplete="email" required />
        <Campo rotulo="Senha" id="senha" type="password" autoComplete="current-password" required />
        <BotaoPrimario carregando={carregando}>Entrar</BotaoPrimario>
      </form>
      <BotoesSociais />
    </CartaoAuth>
  );
}

export default function PaginaEntrar() {
  return (
    <Suspense>
      <FormularioEntrar />
    </Suspense>
  );
}
