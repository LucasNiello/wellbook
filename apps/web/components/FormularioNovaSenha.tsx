'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { esquemaNovaSenha, primeiraMensagem, traduzirErroAuth } from '@wellbook/shared';
import { criarClienteNavegador } from '../lib/supabase/navegador';
import { Aviso, BotaoPrimario, Campo } from './ui';

/**
 * Define uma nova senha para o usuário logado.
 * Usado em /redefinir-senha (RF05, depois do link do e-mail) e /trocar-senha (D20, 1º login).
 * O gatilho do banco zera `troca_senha_obrigatoria` quando a senha muda.
 */
export function FormularioNovaSenha({ textoBotao }: { textoBotao: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const d = new FormData(evento.currentTarget);
    const r = esquemaNovaSenha.safeParse({ senha: d.get('senha'), confirmacaoSenha: d.get('confirmacaoSenha') });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setCarregando(true);
    setErro(null);
    const supabase = criarClienteNavegador();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setCarregando(false);
      return setErro('Sua sessão expirou. Peça um novo link ou entre de novo.');
    }
    const { error } = await supabase.auth.updateUser({ password: r.data.senha });
    setCarregando(false);
    if (error) return setErro(traduzirErroAuth(error.message));
    // O proxy leva para a área do papel (a flag da D20 já foi zerada no banco).
    router.replace('/entrar');
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Aviso texto={erro} />
      <Campo rotulo="Nova senha (mínimo 8 caracteres)" id="senha" type="password" autoComplete="new-password" required />
      <Campo rotulo="Confirme a nova senha" id="confirmacaoSenha" type="password" autoComplete="new-password" required />
      <BotaoPrimario carregando={carregando}>{textoBotao}</BotaoPrimario>
    </form>
  );
}
