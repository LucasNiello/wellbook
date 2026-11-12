/**
 * Os 8 temas das clínicas (documento, seção 8; CLAUDE.md V4, V5, D9).
 *
 * Valores do documento: fundo e destaque (primária) de cada tema.
 * Derivados (D9) e validados por teste de contraste: primária pressionada, texto sobre a
 * primária, superfície, superfície de vitrine, texto suave, acento e borda.
 * V5: nos temas escuros o texto é marfim #F5F1EA e o texto sobre a primária é escuro.
 *
 * Este é o único arquivo com hex de tema. Componentes consomem os tokens (ex.: `--cor-primaria`).
 */
import type { IdTema } from '../tipos/enums';

export type TipoTema = 'claro' | 'escuro';

export interface CoresTema {
  fundo: string;
  superficie: string;
  superficieVitrine: string;
  texto: string;
  textoSuave: string;
  primaria: string;
  primariaPressionada: string;
  textoSobrePrimaria: string;
  acento: string;
  borda: string;
}

export interface Tema {
  id: IdTema;
  nome: string;
  tipo: TipoTema;
  combinaCom: string;
  cores: CoresTema;
}

const FUNDO_CLARO = '#FAF7F2';
const TEXTO_CLARO = '#1A1917';
const TEXTO_SUAVE_CLARO = '#5C574F';
const ACENTO_CLARO = '#7A5C2E';
const BORDA_CLARA = '#E4DED4';
const MARFIM = '#F5F1EA';
const TEXTO_SUAVE_ESCURO = '#C9C2B6';
const ACENTO_ESCURO = '#E3CFA6';

function temaClaro(
  id: IdTema,
  nome: string,
  combinaCom: string,
  primaria: string,
  primariaPressionada: string,
  superficieVitrine: string,
): Tema {
  return {
    id,
    nome,
    tipo: 'claro',
    combinaCom,
    cores: {
      fundo: FUNDO_CLARO,
      superficie: '#FFFFFF',
      superficieVitrine,
      texto: TEXTO_CLARO,
      textoSuave: TEXTO_SUAVE_CLARO,
      primaria,
      primariaPressionada,
      textoSobrePrimaria: '#FFFFFF',
      acento: ACENTO_CLARO,
      borda: BORDA_CLARA,
    },
  };
}

function temaEscuro(
  id: IdTema,
  nome: string,
  combinaCom: string,
  c: Pick<CoresTema, 'fundo' | 'superficie' | 'superficieVitrine' | 'primaria' | 'primariaPressionada' | 'borda'>,
): Tema {
  return {
    id,
    nome,
    tipo: 'escuro',
    combinaCom,
    cores: {
      ...c,
      texto: MARFIM,
      textoSuave: TEXTO_SUAVE_ESCURO,
      // V5: texto escuro sobre a primária clara (o próprio fundo do tema).
      textoSobrePrimaria: c.fundo,
      acento: ACENTO_ESCURO,
    },
  };
}

export const TEMAS: Readonly<Record<IdTema, Tema>> = {
  salvia: temaClaro('salvia', 'Sálvia', 'Estética, terapia', '#3F6B58', '#33584A', '#EDF1EC'),
  petroleo: temaClaro('petroleo', 'Petróleo', 'Clínica, psicologia', '#1F5F6B', '#184C56', '#EAF0F1'),
  terracota: temaClaro('terracota', 'Terracota', 'Barbearia, spa', '#A85A3C', '#8C4A31', '#FAF5F1'),
  lavanda: temaClaro('lavanda', 'Lavanda', 'Saúde mental, holístico', '#6B5B95', '#584A7D', '#EFEDF4'),
  rose: temaClaro('rose', 'Rosé', 'Salão, manicure', '#9C4F6A', '#824158', '#F4EBEE'),
  grafite: temaEscuro('grafite', 'Grafite', 'Barbearia premium', {
    fundo: '#26262A',
    superficie: '#33333A',
    superficieVitrine: '#2E2E33',
    primaria: '#B8C4CF',
    primariaPressionada: '#A3B1BE',
    borda: '#3F3F46',
  }),
  onix: temaEscuro('onix', 'Ônix', 'Estética de luxo', {
    fundo: '#0E0E10',
    superficie: '#1A1A1E',
    superficieVitrine: '#16161A',
    primaria: '#C9A96E',
    primariaPressionada: '#B8975A',
    borda: '#2A2A30',
  }),
  meia_noite: temaEscuro('meia_noite', 'Meia-noite', 'Terapia, spa noturno', {
    fundo: '#0B1426',
    superficie: '#15223B',
    superficieVitrine: '#111D33',
    primaria: '#8FB3E8',
    primariaPressionada: '#7AA2DC',
    borda: '#22304D',
  }),
};

export const LISTA_TEMAS: readonly Tema[] = Object.values(TEMAS);

export const TEMA_PADRAO: IdTema = 'salvia';

/** Nome das variáveis CSS de cada token. */
export const VARIAVEIS_CSS: Readonly<Record<keyof CoresTema, string>> = {
  fundo: '--cor-fundo',
  superficie: '--cor-superficie',
  superficieVitrine: '--cor-superficie-vitrine',
  texto: '--cor-texto',
  textoSuave: '--cor-texto-suave',
  primaria: '--cor-primaria',
  primariaPressionada: '--cor-primaria-pressionada',
  textoSobrePrimaria: '--cor-texto-sobre-primaria',
  acento: '--cor-acento',
  borda: '--cor-borda',
};

/** Objeto de variáveis CSS para aplicar um tema (ex.: `style={variaveisCss('onix')}`). */
export function variaveisCss(id: IdTema): Record<string, string> {
  const cores = TEMAS[id].cores;
  const saida: Record<string, string> = {};
  for (const chave of Object.keys(VARIAVEIS_CSS) as (keyof CoresTema)[]) {
    saida[VARIAVEIS_CSS[chave]] = cores[chave];
  }
  return saida;
}
