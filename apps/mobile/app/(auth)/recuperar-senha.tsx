import { esquemaRecuperarSenha, primeiraMensagem } from '@wellbook/shared';
import { useState } from 'react';
import { Atalho, Botao, Campo, MensagemErro, Tela, Texto, Titulo } from '../../componentes/ui';
import { supabase } from '../../lib/supabase';

export default function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro(null);
    const r = esquemaRecuperarSenha.safeParse({ email });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setEnviando(true);
    // Resposta sempre genérica: não revela se o e-mail existe (RF05).
    await supabase.auth.resetPasswordForEmail(r.data.email);
    setEnviando(false);
    setEnviado(true);
  }

  return (
    <Tela>
      <Titulo>Recuperar senha</Titulo>
      <Texto suave>
        O link enviado por e-mail abre a página de redefinição de senha no site do Wellbook.
      </Texto>
      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
      />
      <MensagemErro texto={erro} />
      {enviado ? <Texto>Se houver uma conta com este e-mail, você vai receber um link.</Texto> : null}
      <Botao titulo={enviando ? 'Enviando...' : 'Enviar link'} aoPressionar={enviar} desabilitado={enviando} />
      <Atalho href="/entrar">Voltar para entrar</Atalho>
    </Tela>
  );
}
