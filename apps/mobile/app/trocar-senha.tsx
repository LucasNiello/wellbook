import { esquemaNovaSenha, primeiraMensagem, rotaInicial, traduzirErroAuth } from '@wellbook/shared';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Botao, Campo, MensagemErro, Tela, Texto, Titulo } from '../componentes/ui';
import { useSessao } from '../contexto/sessao';
import { supabase } from '../lib/supabase';

export default function TrocarSenha() {
  const { trocaSenhaObrigatoria, papeis, recarregar, sair } = useSessao();
  const roteador = useRouter();
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function trocar() {
    setErro(null);
    const r = esquemaNovaSenha.safeParse({ senha, confirmacaoSenha });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: r.data.senha });
    if (error) {
      setEnviando(false);
      return setErro(traduzirErroAuth(error.message));
    }
    // O gatilho do banco zera troca_senha_obrigatoria (D20).
    await recarregar();
    setEnviando(false);
    roteador.replace(rotaInicial(papeis.papeis) as Href);
  }

  return (
    <Tela>
      <Titulo>Trocar senha</Titulo>
      {trocaSenhaObrigatoria ? (
        <Texto suave>Sua senha é provisória. Defina uma nova senha para continuar.</Texto>
      ) : null}
      <Campo rotulo="Nova senha" value={senha} onChangeText={setSenha} secureTextEntry />
      <Campo
        rotulo="Confirmar nova senha"
        value={confirmacaoSenha}
        onChangeText={setConfirmacaoSenha}
        secureTextEntry
      />
      <MensagemErro texto={erro} />
      <Botao titulo={enviando ? 'Salvando...' : 'Salvar nova senha'} aoPressionar={trocar} desabilitado={enviando} />
      <Botao titulo="Sair" secundario aoPressionar={() => void sair()} />
    </Tela>
  );
}
