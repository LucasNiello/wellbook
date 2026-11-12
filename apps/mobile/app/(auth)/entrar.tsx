import { esquemaLogin, primeiraMensagem, traduzirErroAuth } from '@wellbook/shared';
import { useState } from 'react';
import { BotoesSociais } from '../../componentes/botoes-sociais';
import { Atalho, Botao, Campo, MensagemErro, Tela, Titulo } from '../../componentes/ui';
import { supabase } from '../../lib/supabase';

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(null);
    const r = esquemaLogin.safeParse({ email, senha });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: r.data.email,
      password: r.data.senha,
    });
    setEnviando(false);
    // Em caso de sucesso, a guarda de rotas do layout redireciona.
    if (error) setErro(traduzirErroAuth(error.message));
  }

  return (
    <Tela>
      <Titulo>Entrar</Titulo>
      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
      />
      <Campo
        rotulo="Senha"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoComplete="password"
      />
      <MensagemErro texto={erro} />
      <Botao titulo={enviando ? 'Entrando...' : 'Entrar'} aoPressionar={entrar} desabilitado={enviando} />
      <BotoesSociais />
      <Atalho href="/recuperar-senha">Esqueci minha senha</Atalho>
      <Atalho href="/cadastro">Criar conta</Atalho>
    </Tela>
  );
}
