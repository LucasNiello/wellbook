import {
  esquemaAbrirEmpresa,
  parametrosCadastrarEmpresa,
  primeiraMensagem,
  ROTA_DO_PAPEL,
  traduzirErroBanco,
  type Papel,
} from '@wellbook/shared';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { CamposEmpresa, EMPRESA_VAZIA, dadosDaEmpresa } from '../componentes/CamposEmpresa';
import { Botao, Atalho, MensagemErro, Tela, Texto, Titulo } from '../componentes/ui';
import { useSessao } from '../contexto/sessao';
import { supabase } from '../lib/supabase';

const ROTULO_PAPEL: Record<Papel, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador da clínica',
  profissional: 'Profissional',
  cliente: 'Cliente',
};

const AVISO_EXCLUSAO =
  'Seus agendamentos futuros serão cancelados, as observações que você escreveu serão apagadas e ' +
  'seu nome, e-mail e telefone serão removidos. Os registros financeiros dos atendimentos já ' +
  'realizados ficam com a clínica, sem identificar você. Não é possível desfazer.';

/** Em resposta não-2xx, o corpo da Edge Function ({ erro }) vem em `error.context` (Response). */
async function mensagemDoServidor(erro: unknown): Promise<string | null> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response)) return null;
  try {
    const corpo = (await contexto.json()) as { erro?: unknown };
    return typeof corpo.erro === 'string' ? corpo.erro : null;
  } catch {
    return null;
  }
}

export default function Conta() {
  const { perfil, papeis, sair, recarregar } = useSessao();
  const roteador = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [empresaAberta, setEmpresaAberta] = useState(false);
  const [empresa, setEmpresa] = useState(EMPRESA_VAZIA);
  const [excluindo, setExcluindo] = useState(false);
  // Revisão da Etapa B (achado 2): o cadastro da porta Empresa manda para cá o erro da RPC,
  // porque a guarda de rotas pode trocar de tela antes de a RPC responder.
  const { aviso } = useLocalSearchParams<{ aviso?: string }>();
  const [erro, setErro] = useState<string | null>(typeof aviso === 'string' && aviso ? aviso : null);
  const soCliente = papeis.papeis.length === 1 && papeis.papeis[0] === 'cliente';
  // Cosmético 8 (Etapa B): abrir empresa e excluir conta só para quem não tem NENHUM vínculo
  // (o profissional desativado também fica de fora — JA_PROFISSIONAL / CONTA_COM_VINCULO).
  const clientePuro = papeis.clientePuro;

  // D22 / RNF05: Edge Function `excluir-conta` (valida o usuário, anonimiza pela RPC e remove do Auth).
  async function excluir() {
    setExcluindo(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; erro?: string }>('excluir-conta', {
      method: 'POST',
    });
    if (error || !data?.ok) {
      setExcluindo(false);
      setErro((await mensagemDoServidor(error)) ?? data?.erro ?? 'Não foi possível excluir a conta agora. Tente de novo.');
      return;
    }
    await sair();
  }

  // D38: o cliente abre uma empresa (mesma RPC da porta Empresa — D29).
  async function abrirEmpresa() {
    setErro(null);
    const r = esquemaAbrirEmpresa.safeParse(dadosDaEmpresa(empresa));
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setAbrindo(true);
    const { error } = await supabase.rpc('cadastrar_empresa', parametrosCadastrarEmpresa(r.data));
    if (error) {
      setAbrindo(false);
      return setErro(traduzirErroBanco(error));
    }
    await recarregar();
    roteador.replace(ROTA_DO_PAPEL.admin as Href);
  }

  function confirmar() {
    Alert.alert('Excluir sua conta?', AVISO_EXCLUSAO, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sim, excluir', style: 'destructive', onPress: () => void excluir() },
    ]);
  }

  return (
    <Tela>
      <Titulo>Minha conta</Titulo>
      <MensagemErro texto={erro} />
      <Texto>Nome: {perfil?.nome ?? '—'}</Texto>
      <Texto>E-mail: {perfil?.email ?? '—'}</Texto>
      <Texto>Telefone: {perfil?.telefone ?? '—'}</Texto>
      <Texto>Papéis: {papeis.papeis.map((p) => ROTULO_PAPEL[p]).join(', ')}</Texto>
      <Atalho href="/trocar-senha">Trocar senha</Atalho>
      <Atalho href="/privacidade">Política de privacidade</Atalho>
      {soCliente ? (
        <>
          <Botao titulo="Encontrar uma clínica" secundario aoPressionar={() => roteador.push('/clinicas')} />
          {!clientePuro ? null : empresaAberta ? (
            <>
              <Texto suave>Você vira o administrador da empresa. Uma empresa por conta; sem CNPJ.</Texto>
              <CamposEmpresa valor={empresa} aoMudar={setEmpresa} />
              <Botao
                titulo={abrindo ? 'Criando…' : 'Criar empresa'}
                desabilitado={abrindo}
                aoPressionar={() => void abrirEmpresa()}
              />
            </>
          ) : (
            <Botao titulo="Abrir minha empresa" secundario aoPressionar={() => setEmpresaAberta(true)} />
          )}
        </>
      ) : null}
      {clientePuro ? (
        <Botao
          titulo={excluindo ? 'Excluindo…' : 'Excluir minha conta'}
          secundario
          desabilitado={excluindo}
          aoPressionar={confirmar}
        />
      ) : (
        <Texto suave>Contas de clínica ou de profissional são encerradas pela administração.</Texto>
      )}
      <Botao titulo="Sair" aoPressionar={() => void sair()} />
    </Tela>
  );
}
