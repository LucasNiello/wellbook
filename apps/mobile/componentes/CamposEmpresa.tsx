import { gerarSlug, type ModoEmpresa } from '@wellbook/shared';
import { StyleSheet, View } from 'react-native';
import { Botao, Campo, Texto } from './ui';

/** Estado dos campos da empresa (D28–D30, D40), compartilhado entre o cadastro e "Abrir minha empresa" (D38). */
export interface ValorEmpresa {
  nomeEmpresa: string;
  slug: string;
  slugEditado: boolean;
  modo: ModoEmpresa | null;
  especialidade: string;
}

export const EMPRESA_VAZIA: ValorEmpresa = {
  nomeEmpresa: '',
  slug: '',
  slugEditado: false,
  modo: null,
  especialidade: '',
};

/** Entrada para esquemaAbrirEmpresa / esquemaCadastroEmpresa. */
export function dadosDaEmpresa(v: ValorEmpresa) {
  return {
    nomeEmpresa: v.nomeEmpresa,
    slug: v.slug,
    modo: v.modo ?? undefined,
    especialidade: v.especialidade,
  };
}

export function CamposEmpresa({
  valor,
  aoMudar,
}: {
  valor: ValorEmpresa;
  aoMudar: (novo: ValorEmpresa) => void;
}) {
  return (
    <View style={estilos.grupo}>
      <Campo
        rotulo="Nome da empresa"
        value={valor.nomeEmpresa}
        maxLength={120}
        autoCapitalize="words"
        onChangeText={(t) =>
          aoMudar({ ...valor, nomeEmpresa: t, slug: valor.slugEditado ? valor.slug : gerarSlug(t) })
        }
      />
      <Campo
        rotulo="Link da página (wellbook/…)"
        value={valor.slug}
        maxLength={60}
        placeholder="nome-da-empresa"
        onChangeText={(t) => aoMudar({ ...valor, slug: t.toLowerCase(), slugEditado: true })}
      />
      <Texto suave>
        Letras minúsculas, números e hífens. Se já existir, acrescentamos um número no fim. Depois de criado, o
        link não muda.
      </Texto>
      <Texto>Você atende sozinho ou tem equipe?</Texto>
      <Botao
        titulo={valor.modo === 'sozinho' ? '● Atendo sozinho' : '○ Atendo sozinho'}
        secundario={valor.modo !== 'sozinho'}
        aoPressionar={() => aoMudar({ ...valor, modo: 'sozinho' })}
      />
      <Botao
        titulo={valor.modo === 'equipe' ? '● Tenho equipe' : '○ Tenho equipe'}
        secundario={valor.modo !== 'equipe'}
        aoPressionar={() => aoMudar({ ...valor, modo: 'equipe' })}
      />
      {valor.modo === 'sozinho' ? (
        <Campo
          rotulo="Sua especialidade (ex.: Manicure, Psicóloga)"
          value={valor.especialidade}
          maxLength={80}
          autoCapitalize="sentences"
          onChangeText={(t) => aoMudar({ ...valor, especialidade: t })}
        />
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: 14 },
});
