import { esquemaCadastro, primeiraMensagem, traduzirErroAuth } from '@wellbook/shared';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { BotoesSociais } from '../../componentes/botoes-sociais';
import { Atalho, Botao, Campo, MensagemErro, Tela, Texto, Titulo, cores } from '../../componentes/ui';
import { supabase } from '../../lib/supabase';

export default function Cadastro() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cadastrar() {
    setErro(null);
    setAviso(null);
    const r = esquemaCadastro.safeParse({
      nome,
      email,
      telefone,
      senha,
      confirmacaoSenha,
      consentimentoLgpd: consentimento,
    });
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: r.data.email,
      password: r.data.senha,
      // O gatilho do banco grava consentimento_lgpd_em = now() quando consentimento_lgpd é true (RNF05, DP2).
      options: {
        data: { nome: r.data.nome, telefone: r.data.telefone, consentimento_lgpd: r.data.consentimentoLgpd },
      },
    });
    if (error) {
      setEnviando(false);
      return setErro(traduzirErroAuth(error.message));
    }
    if (!data.session) {
      setAviso('Conta criada. Confirme seu e-mail para entrar.');
    }
    setEnviando(false);
  }

  return (
    <Tela>
      <Titulo>Criar conta</Titulo>
      <Campo rotulo="Nome" value={nome} onChangeText={setNome} autoCapitalize="words" autoComplete="name" />
      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
      />
      <Campo
        rotulo="Telefone (com DDD)"
        value={telefone}
        onChangeText={setTelefone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry />
      <Campo
        rotulo="Confirmar senha"
        value={confirmacaoSenha}
        onChangeText={setConfirmacaoSenha}
        secureTextEntry
      />
      <View style={estilos.consentimento}>
        <Switch
          value={consentimento}
          onValueChange={setConsentimento}
          trackColor={{ true: cores.primaria, false: cores.borda }}
          accessibilityLabel="Aceito a política de privacidade"
        />
        <Text style={estilos.textoConsentimento}>
          <Texto>Li e aceito a </Texto>
          <Atalho href="/privacidade">política de privacidade</Atalho>
        </Text>
      </View>
      <MensagemErro texto={erro} />
      {aviso ? <Texto>{aviso}</Texto> : null}
      <Botao
        titulo={enviando ? 'Criando...' : 'Criar conta'}
        aoPressionar={cadastrar}
        desabilitado={enviando}
      />
      <BotoesSociais />
      <Atalho href="/entrar">Já tenho conta</Atalho>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  consentimento: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textoConsentimento: { flex: 1 },
});
