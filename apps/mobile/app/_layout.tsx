import { exigeLogin, podeAcessar, rotaInicial, TEMAS, TEMA_PADRAO } from '@wellbook/shared';
import { Stack, usePathname, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProvedorSessao, useSessao } from '../contexto/sessao';

const ROTAS_AUTH = ['/entrar', '/cadastro', '/recuperar-senha'];

/**
 * Guarda de rotas. O Stack fica sempre montado (o Expo Router exige o navegador antes de navegar);
 * enquanto a sessão carrega ou o redirecionamento está pendente, uma capa cobre a tela para a
 * área protegida não piscar. Quem protege os dados é a RLS do banco.
 */
function GuardaDeRotas() {
  const { sessao, carregando, papeis, trocaSenhaObrigatoria } = useSessao();
  const caminho = usePathname();
  const roteador = useRouter();

  let destino: string | null = null;
  if (!carregando) {
    if (!sessao) {
      if (exigeLogin(caminho)) destino = '/entrar';
    } else if (trocaSenhaObrigatoria) {
      if (caminho !== '/trocar-senha') destino = '/trocar-senha';
    } else if (ROTAS_AUTH.includes(caminho) || !podeAcessar(caminho, papeis.papeis)) {
      destino = rotaInicial(papeis.papeis);
    }
    if (destino === caminho) destino = null;
  }

  useEffect(() => {
    if (destino) roteador.replace(destino as Href);
  }, [destino, roteador]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {carregando || destino ? <View style={estilos.capa} /> : null}
    </>
  );
}

const estilos = StyleSheet.create({
  capa: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: TEMAS[TEMA_PADRAO].cores.fundo },
});

export default function LayoutRaiz() {
  return (
    <ProvedorSessao>
      <StatusBar style="auto" />
      <GuardaDeRotas />
    </ProvedorSessao>
  );
}
