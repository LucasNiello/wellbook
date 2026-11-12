import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSessao } from '../contexto/sessao';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CORES_STATUS,
  MARCA,
  STATUS_AGENDAMENTO,
  TEMAS,
  TEMA_PADRAO,
  calcularConclusao,
  formatarReais,
} from '@wellbook/shared';

// Tela provisória da Fase 1: prova que o app consome o pacote compartilhado.
const cores = TEMAS[TEMA_PADRAO].cores;

export default function TelaInicial() {
  const { sessao } = useSessao();
  const exemplo = calcularConclusao({
    precosServicos: [15000, 7000],
    ajuste: -2000,
    percentualRepasse: 3000,
  });

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>{MARCA.nome}</Text>
        <Text style={estilos.suave}>{MARCA.slogan}</Text>
        <Text style={estilos.texto}>
          Clínica {formatarReais(exemplo.valorClinica)} · Profissional{' '}
          {formatarReais(exemplo.valorProfissional)}
        </Text>
        <View style={estilos.linha}>
          {STATUS_AGENDAMENTO.map((status) => (
            <Text
              key={status}
              style={[
                estilos.selo,
                // Cores de status fixas (RNF08), não vêm do tema.
                { backgroundColor: CORES_STATUS[status].fundo, color: CORES_STATUS[status].texto },
              ]}
            >
              {CORES_STATUS[status].rotulo}
            </Text>
          ))}
        </View>
        <Link href={sessao ? '/conta' : '/entrar'} style={estilos.link}>
          {sessao ? 'Minha conta' : 'Entrar'}
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 24, gap: 12 },
  titulo: { fontSize: 36, color: cores.texto },
  suave: { color: cores.textoSuave },
  texto: { color: cores.texto },
  link: { color: cores.primaria, fontSize: 16, paddingVertical: 6 },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selo: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, overflow: 'hidden' },
});
