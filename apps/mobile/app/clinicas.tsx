import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Atalho, Campo, MensagemErro, Tela, Texto, Titulo, cores } from '../componentes/ui';
import { supabase } from '../lib/supabase';

interface Clinica {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
}

/** D21: lista pública das clínicas ativas, com busca por nome. A vitrine de cada clínica vem na Fase 5. */
export default function Clinicas() {
  const [clinicas, setClinicas] = useState<Clinica[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let ativo = true;
    void supabase
      .from('tenants')
      .select('id,nome,slug,logo_url')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro('Não foi possível carregar as clínicas agora. Tente de novo.');
        else setClinicas((data ?? []) as Clinica[]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (clinicas ?? []).filter((c) => c.nome.toLowerCase().includes(termo));
  }, [clinicas, busca]);

  return (
    <Tela>
      <Titulo>Clínicas</Titulo>
      <Campo rotulo="Buscar por nome" value={busca} onChangeText={setBusca} autoCapitalize="none" />
      <MensagemErro texto={erro} />
      {!erro && clinicas === null ? <Texto suave>Carregando…</Texto> : null}
      {clinicas !== null && filtradas.length === 0 ? (
        <Texto suave>
          {clinicas.length === 0 ? 'Nenhuma clínica disponível por enquanto.' : 'Nenhuma clínica encontrada.'}
        </Texto>
      ) : null}
      {filtradas.map((c) => (
        <View key={c.id} style={estilos.cartao}>
          <Texto>{c.nome}</Texto>
          <Texto suave>/{c.slug}</Texto>
          <Texto suave>Agendamento online em breve</Texto>
        </View>
      ))}
      <Atalho href="/conta">Minha conta</Atalho>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
});
