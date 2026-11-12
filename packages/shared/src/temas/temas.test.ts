import { describe, it, expect } from 'vitest';
import {
  IDS_TEMA,
  TEMAS,
  LISTA_TEMAS,
  TEMA_PADRAO,
  VARIAVEIS_CSS,
  variaveisCss,
  CORES_STATUS,
  STATUS_AGENDAMENTO,
  MARCA,
  luminancia,
  razaoContraste,
  CONTRASTE_MINIMO_TEXTO,
  CONTRASTE_MINIMO_COMPONENTE,
} from '../index';

const min = (s: string) => s.toLowerCase();

describe('contraste (RNF07, WCAG)', () => {
  it('preto x branco = 21', () => {
    expect(razaoContraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
  it('é simétrico', () => {
    expect(razaoContraste('#3F6B58', '#FAF7F2')).toBeCloseTo(razaoContraste('#FAF7F2', '#3F6B58'), 10);
  });
  it('mesma cor = 1', () => {
    expect(razaoContraste('#3F6B58', '#3F6B58')).toBeCloseTo(1, 10);
  });
  it('luminância: preto 0, branco 1', () => {
    expect(luminancia('#000000')).toBeCloseTo(0, 10);
    expect(luminancia('#FFFFFF')).toBeCloseTo(1, 10);
  });
  it('limiares', () => {
    expect(CONTRASTE_MINIMO_TEXTO).toBe(4.5);
    expect(CONTRASTE_MINIMO_COMPONENTE).toBe(3);
  });
});

describe('RNF07: os 8 temas do documento', () => {
  it('há exatamente 8 temas, com os ids esperados', () => {
    expect([...IDS_TEMA]).toEqual([
      'salvia', 'petroleo', 'terracota', 'lavanda', 'rose', 'grafite', 'onix', 'meia_noite',
    ]);
    expect(LISTA_TEMAS).toHaveLength(8);
    expect(Object.keys(TEMAS).sort()).toEqual([...IDS_TEMA].sort());
  });

  it('tema padrão existe', () => {
    expect(IDS_TEMA).toContain(TEMA_PADRAO);
    expect(TEMAS[TEMA_PADRAO]).toBeDefined();
  });

  it('cada tema tem o id coerente com a chave e nome preenchido', () => {
    for (const id of IDS_TEMA) {
      expect(TEMAS[id].id).toBe(id);
      expect(TEMAS[id].nome.length).toBeGreaterThan(0);
    }
  });

  it('5 claros e 3 escuros', () => {
    const claros = LISTA_TEMAS.filter((t) => t.tipo === 'claro').map((t) => t.id).sort();
    const escuros = LISTA_TEMAS.filter((t) => t.tipo === 'escuro').map((t) => t.id).sort();
    expect(claros).toEqual(['lavanda', 'petroleo', 'rose', 'salvia', 'terracota']);
    expect(escuros).toEqual(['grafite', 'meia_noite', 'onix']);
  });

  describe('cores do documento (seção 8)', () => {
    const primarias: Record<string, string> = {
      salvia: '#3F6B58',
      petroleo: '#1F5F6B',
      terracota: '#A85A3C',
      lavanda: '#6B5B95',
      rose: '#9C4F6A',
      grafite: '#B8C4CF',
      onix: '#C9A96E',
      meia_noite: '#8FB3E8',
    };
    for (const [id, cor] of Object.entries(primarias)) {
      it(`${id}: primária ${cor}`, () => {
        expect(min(TEMAS[id as keyof typeof TEMAS].cores.primaria)).toBe(min(cor));
      });
    }
    const fundos: Record<string, string> = {
      salvia: '#FAF7F2',
      grafite: '#26262A',
      onix: '#0E0E10',
      meia_noite: '#0B1426',
    };
    for (const [id, cor] of Object.entries(fundos)) {
      it(`${id}: fundo ${cor}`, () => {
        expect(min(TEMAS[id as keyof typeof TEMAS].cores.fundo)).toBe(min(cor));
      });
    }
  });

  describe('contraste dos tokens (D9)', () => {
    for (const id of IDS_TEMA) {
      describe(id, () => {
        const c = TEMAS[id].cores;
        it('texto e textoSuave ≥ 4,5 sobre fundo, superfície e superfície de vitrine', () => {
          for (const texto of [c.texto, c.textoSuave]) {
            for (const base of [c.fundo, c.superficie, c.superficieVitrine]) {
              expect(razaoContraste(texto, base)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
            }
          }
        });
        it('textoSobrePrimaria ≥ 4,5 sobre primária e primária pressionada', () => {
          expect(razaoContraste(c.textoSobrePrimaria, c.primaria)).toBeGreaterThanOrEqual(
            CONTRASTE_MINIMO_TEXTO,
          );
          expect(razaoContraste(c.textoSobrePrimaria, c.primariaPressionada)).toBeGreaterThanOrEqual(
            CONTRASTE_MINIMO_TEXTO,
          );
        });
        it('primária e acento ≥ 4,5 sobre o fundo', () => {
          expect(razaoContraste(c.primaria, c.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
          expect(razaoContraste(c.acento, c.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
        });
        it('D9: primária e acento ≥ 4,5 sobre superfície e superfície de vitrine', () => {
          for (const sup of [c.superficie, c.superficieVitrine]) {
            expect(razaoContraste(c.primaria, sup)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
            expect(razaoContraste(c.acento, sup)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
          }
        });
        it('todas as cores são hex válidos', () => {
          for (const valor of Object.values(c)) {
            expect(valor).toMatch(/^#[0-9a-fA-F]{6}$/);
          }
        });
      });
    }
  });

  describe('V5: temas escuros', () => {
    for (const id of IDS_TEMA.filter((i) => TEMAS[i].tipo === 'escuro')) {
      it(`${id}: texto marfim #F5F1EA e texto sobre primária escuro`, () => {
        expect(min(TEMAS[id].cores.texto)).toBe('#f5f1ea');
        expect(luminancia(TEMAS[id].cores.textoSobrePrimaria)).toBeLessThan(0.2);
      });
    }
  });
});

describe('variáveis CSS', () => {
  it('primaria mapeia para --cor-primaria', () => {
    expect(VARIAVEIS_CSS.primaria).toBe('--cor-primaria');
  });
  it('todas as variáveis seguem o prefixo --cor-', () => {
    for (const v of Object.values(VARIAVEIS_CSS)) {
      expect(v.startsWith('--cor-')).toBe(true);
    }
  });
  it('variaveisCss devolve os valores do tema', () => {
    const v = variaveisCss('salvia');
    expect(min(v['--cor-primaria']!)).toBe('#3f6b58');
    expect(min(v['--cor-fundo']!)).toBe('#faf7f2');
  });
  it('variaveisCss tem uma entrada por cor do tema', () => {
    for (const id of IDS_TEMA) {
      expect(Object.keys(variaveisCss(id)).sort()).toEqual(Object.values(VARIAVEIS_CSS).sort());
    }
  });
  it('variáveis de cores de status não aparecem no tema (RNF08)', () => {
    for (const id of IDS_TEMA) {
      for (const nome of Object.keys(variaveisCss(id))) {
        expect(nome).not.toMatch(/status/);
      }
    }
  });
});

describe('RNF08/D8: cores de status fixas', () => {
  it('há 4 status com rótulo, fundo e texto', () => {
    expect(Object.keys(CORES_STATUS).sort()).toEqual([...STATUS_AGENDAMENTO].sort());
    for (const s of STATUS_AGENDAMENTO) {
      expect(CORES_STATUS[s].rotulo.length).toBeGreaterThan(0);
      expect(CORES_STATUS[s].fundo).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(CORES_STATUS[s].texto).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('texto ≥ 4,5 sobre o fundo do selo', () => {
    for (const s of STATUS_AGENDAMENTO) {
      expect(razaoContraste(CORES_STATUS[s].texto, CORES_STATUS[s].fundo)).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO_TEXTO,
      );
    }
  });

  it('fundo do selo ≥ 3 contra o fundo de cada um dos 8 temas', () => {
    for (const s of STATUS_AGENDAMENTO) {
      for (const id of IDS_TEMA) {
        expect(
          razaoContraste(CORES_STATUS[s].fundo, TEMAS[id].cores.fundo),
          `${s} sobre ${id}`,
        ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_COMPONENTE);
      }
    }
  });

  it('os 4 status têm fundos distintos', () => {
    const fundos = STATUS_AGENDAMENTO.map((s) => min(CORES_STATUS[s].fundo));
    expect(new Set(fundos).size).toBe(4);
  });

  it('nenhuma cor de fundo de status é igual a uma cor de tema (status não vem do tema)', () => {
    // Só o fundo do selo identifica o status. O texto branco (#FFFFFF) coincide com a
    // superfície dos temas claros por acaso, o que não faz o status depender do tema.
    const coresTema = new Set<string>();
    for (const id of IDS_TEMA) {
      for (const v of Object.values(TEMAS[id].cores)) coresTema.add(min(v));
    }
    for (const s of STATUS_AGENDAMENTO) {
      expect(coresTema.has(min(CORES_STATUS[s].fundo))).toBe(false);
    }
  });
});

describe('marca Wellbook', () => {
  it('nome, cores e fontes', () => {
    expect(MARCA.nome).toBe('Wellbook');
    expect(MARCA.cores.preto).toBe('#0E0E10');
    expect(MARCA.cores.marfim).toBe('#F5F1EA');
    expect(MARCA.cores.champagne).toBe('#C9A96E');
    expect(MARCA.fontes.titulos).toBe('Cormorant Garamond');
    expect(MARCA.fontes.interface).toBe('Inter');
  });
});
