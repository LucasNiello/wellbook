import {
  esquemaCadastro,
  esquemaCadastroEmpresa,
  parametrosCadastrarEmpresa,
  primeiraMensagem,
  ROTA_DO_PAPEL,
  traduzirErroAuth,
  traduzirErroBanco,
} from '@wellbook/shared';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { BotoesSociais } from '../../componentes/botoes-sociais';
import { CamposEmpresa, EMPRESA_VAZIA, dadosDaEmpresa } from '../../componentes/CamposEmpresa';
import { Atalho, Botao, Campo, MensagemErro, Tela, Texto, Titulo, cores } from '../../componentes/ui';
import { useSessao } from '../../contexto/sessao';
import { supabase } from '../../lib/supabase';

type Porta = 'cliente' | 'empresa';

export default function Cadastro() {
  const roteador = useRouter();
  const { recarregar } = useSessao();
  const [porta, setPorta] = useState<Porta>('cliente');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [empresa, setEmpresa] = useState(EMPRESA_VAZIA);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cadastrar() {
    setErro(null);
    setAviso(null);
    const pessoa = {
      nome,
      email,
      telefone,
      senha,
      confirmacaoSenha,
      consentimentoLgpd: consentimento,
    };
    const r =
      porta === 'empresa'
        ? esquemaCadastroEmpresa.safeParse({ ...pessoa, ...dadosDaEmpresa(empresa) })
        : esquemaCadastro.safeParse(pessoa);
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
      setEnviando(false);
      return setAviso('Conta criada. Confirme seu e-mail para entrar.');
    }
    if (porta === 'cliente') {
      // A guarda de rotas também redireciona quem acabou de entrar.
      setEnviando(false);
      return roteador.replace(ROTA_DO_PAPEL.cliente as Href);
    }
    // D29: a conta nasce cliente e a RPC cria a empresa (e o papel admin) em seguida.
    const dadosEmpresa = r.data as ReturnType<typeof esquemaCadastroEmpresa.parse>;
    const { error: erroEmpresa } = await supabase.rpc(
      'cadastrar_empresa',
      parametrosCadastrarEmpresa(dadosEmpresa),
    );
    if (erroEmpresa) {
      // A guarda pode já ter trocado de tela (SIGNED_IN como cliente): o aviso vai para /conta,
      // onde o "Abrir minha empresa" permite tentar de novo (D38). Revisão da Etapa B, achado 2.
      setEnviando(false);
      return roteador.replace({
        pathname: '/conta',
        params: {
          aviso: `${traduzirErroBanco(erroEmpresa)} Sua conta foi criada como cliente; tente de novo em "Abrir minha empresa".`,
        },
      } as Href);
    }
    await recarregar();
    setEnviando(false);
    roteador.replace(ROTA_DO_PAPEL.admin as Href);
  }

  return (
    <Tela>
      <Titulo>Criar conta</Titulo>
      <Botao
        titulo="Sou cliente"
        secundario={porta !== 'cliente'}
        aoPressionar={() => setPorta('cliente')}
      />
      <Botao
        titulo="Tenho uma empresa"
        secundario={porta !== 'empresa'}
        aoPressionar={() => setPorta('empresa')}
      />
      <Texto suave>É profissional de uma clínica? Sua conta é criada pelo administrador da clínica.</Texto>
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
      {porta === 'empresa' ? <CamposEmpresa valor={empresa} aoMudar={setEmpresa} /> : null}
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
        titulo={enviando ? 'Criando...' : porta === 'empresa' ? 'Criar conta e empresa' : 'Criar conta'}
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
