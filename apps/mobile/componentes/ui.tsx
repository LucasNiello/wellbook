import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TEMAS, TEMA_PADRAO } from '@wellbook/shared';

export const cores = TEMAS[TEMA_PADRAO].cores;

export function Tela({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={e.tela}>
      <ScrollView contentContainerStyle={e.conteudo} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={e.titulo}>{children}</Text>;
}

export function Texto({ children, suave }: { children: ReactNode; suave?: boolean }) {
  return <Text style={suave ? e.suave : e.texto}>{children}</Text>;
}

export function Campo({ rotulo, ...resto }: TextInputProps & { rotulo: string }) {
  return (
    <View style={e.campo}>
      <Text style={e.rotulo}>{rotulo}</Text>
      <TextInput
        style={e.entrada}
        placeholderTextColor={cores.textoSuave}
        autoCapitalize="none"
        {...resto}
      />
    </View>
  );
}

export function Botao({
  titulo,
  aoPressionar,
  desabilitado,
  secundario,
  selo,
}: {
  titulo: string;
  aoPressionar?: () => void;
  desabilitado?: boolean;
  secundario?: boolean;
  selo?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desabilitado }}
      disabled={desabilitado}
      onPress={aoPressionar}
      style={({ pressed }) => [
        e.botao,
        secundario
          ? e.botaoSecundario
          : { backgroundColor: pressed ? cores.primariaPressionada : cores.primaria },
        desabilitado && e.desabilitado,
      ]}
    >
      <Text style={secundario ? e.textoBotaoSecundario : e.textoBotao}>{titulo}</Text>
      {selo ? <Text style={e.selo}>{selo}</Text> : null}
    </Pressable>
  );
}

export function Atalho({ href, children }: { href: Href; children: ReactNode }) {
  return (
    <Link href={href} style={e.link}>
      {children}
    </Link>
  );
}

export function MensagemErro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <Text accessibilityRole="alert" style={e.erro}>
      {texto}
    </Text>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 24, gap: 14 },
  titulo: { fontSize: 28, color: cores.texto },
  texto: { color: cores.texto, fontSize: 15, lineHeight: 22 },
  suave: { color: cores.textoSuave, fontSize: 14, lineHeight: 20 },
  campo: { gap: 6 },
  rotulo: { color: cores.texto, fontSize: 14 },
  entrada: {
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    color: cores.texto,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  botaoSecundario: { borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.superficie },
  textoBotao: { color: cores.textoSobrePrimaria, fontSize: 16, fontWeight: '600' },
  textoBotaoSecundario: { color: cores.texto, fontSize: 16 },
  desabilitado: { opacity: 0.55 },
  selo: {
    fontSize: 11,
    color: cores.textoSuave,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  link: { color: cores.primaria, fontSize: 15, paddingVertical: 6 },
  erro: {
    color: cores.texto,
    borderLeftWidth: 3,
    borderLeftColor: cores.acento,
    paddingLeft: 8,
    fontSize: 14,
  },
});
