import type { Papel } from '@wellbook/shared';
import { useState } from 'react';
import { Alert } from 'react-native';
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
  const { perfil, papeis, sair } = useSessao();
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const soCliente = papeis.papeis.length === 1 && papeis.papeis[0] === 'cliente';

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
