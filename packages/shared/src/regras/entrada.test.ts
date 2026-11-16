import { describe, expect, it } from 'vitest';
import {
  centavosParaTexto,
  pontosBaseParaTexto,
  textoParaCentavos,
  textoParaPontosBase,
} from './entrada';
import { gerarSlug, SLUGS_RESERVADOS, slugReservado } from './slug';
import {
  campoPercentual,
  campoReais,
  esquemaFormularioProfissional,
  esquemaFormularioServico,
  REPASSE_ATENDO_SOZINHO_PONTOS_BASE,
  REPASSE_PADRAO_PONTOS_BASE,
} from '../schemas';
import { codigoErroWellbook, traduzirErroBanco } from '../erros-banco';

const ok = (valor: number) => ({ ok: true, valor });

describe('A2: texto digitado → centavos, sem ponto flutuante', () => {
  it('casos exigidos pelo Lucas', () => {
    expect(textoParaCentavos('12,345').ok).toBe(false); // antes virava 1235 em silêncio
    expect(textoParaCentavos('1.234,56')).toEqual(ok(123456)); // antes virava NaN
  });
  it('formatos brasileiros aceitos', () => {
    expect(textoParaCentavos('220')).toEqual(ok(22000));
    expect(textoParaCentavos('220,00')).toEqual(ok(22000));
    expect(textoParaCentavos('12,5')).toEqual(ok(1250));
    expect(textoParaCentavos('R$ 1.234,56')).toEqual(ok(123456));
    expect(textoParaCentavos('1.234')).toEqual(ok(123400)); // ponto = milhar
    expect(textoParaCentavos('1.234.567,89')).toEqual(ok(123456789));
    expect(textoParaCentavos('12.5')).toEqual(ok(1250)); // ponto com 1–2 casas = decimal
    expect(textoParaCentavos('0,01')).toEqual(ok(1));
    expect(textoParaCentavos(' 0 ')).toEqual(ok(0));
  });
  it('valores que o float erraria saem exatos', () => {
    expect(textoParaCentavos('0,29')).toEqual(ok(29)); // 0.29 * 100 = 28.999999999999996
    expect(textoParaCentavos('1,15')).toEqual(ok(115)); // 1.15 * 100 = 114.99999999999999
    expect(textoParaCentavos('4,35')).toEqual(ok(435)); // 4.35 * 100 = 434.99999999999994
  });
  it('recusa com mensagem clara', () => {
    expect(textoParaCentavos('12,345')).toEqual({ ok: false, mensagem: 'Use no máximo 2 casas decimais.' });
    expect(textoParaCentavos('1.2345')).toEqual({ ok: false, mensagem: 'Use no máximo 2 casas decimais.' });
    expect(textoParaCentavos('-5')).toEqual({ ok: false, mensagem: 'O valor não pode ser negativo.' });
    expect(textoParaCentavos('')).toEqual({ ok: false, mensagem: 'Informe o valor.' });
    for (const ruim of ['abc', '1,2,3', '12,', ',50', '1.23.4', '1e3', '1,234.56', 'NaN', 'Infinity']) {
      expect(textoParaCentavos(ruim).ok, ruim).toBe(false);
    }
    expect(textoParaCentavos('99999999999999999999').ok).toBe(false);
    // Revisão da Etapa B (achado 5): zero à esquerda com milhar é ambíguo e é recusado.
    expect(textoParaCentavos('0.250').ok).toBe(false);
    expect(textoParaCentavos('0,25')).toEqual(ok(25));
  });
  it('ida e volta para o campo do formulário', () => {
    expect(centavosParaTexto(123456)).toBe('1234,56');
    expect(centavosParaTexto(5)).toBe('0,05');
    expect(textoParaCentavos(centavosParaTexto(987654))).toEqual(ok(987654));
  });
});

describe('A2/D1: texto digitado → pontos-base', () => {
  it('casos exigidos', () => {
    expect(textoParaPontosBase('33,333%').ok).toBe(false); // antes virava 3333 em silêncio
    expect(textoParaPontosBase('20')).toEqual(ok(2000));
    expect(textoParaPontosBase('20%')).toEqual(ok(2000));
    expect(textoParaPontosBase('33,33')).toEqual(ok(3333));
    expect(textoParaPontosBase('0')).toEqual(ok(0));
    expect(textoParaPontosBase('100')).toEqual(ok(10000));
  });
  it('fora de 0–100% é recusado', () => {
    expect(textoParaPontosBase('100,01').ok).toBe(false);
    expect(textoParaPontosBase('-1').ok).toBe(false);
    expect(textoParaPontosBase('1.000').ok).toBe(false);
  });
  it('ida e volta', () => {
    expect(pontosBaseParaTexto(2000)).toBe('20,00');
    expect(pontosBaseParaTexto(3333)).toBe('33,33');
    expect(textoParaPontosBase(pontosBaseParaTexto(1)).valueOf()).toEqual(ok(1));
  });
});

describe('A2: schemas Zod dos formulários do painel', () => {
  it('campoReais e campoPercentual', () => {
    expect(campoReais.parse('1.234,56')).toBe(123456);
    expect(campoReais.safeParse('12,345').success).toBe(false);
    expect(campoPercentual.parse('30')).toBe(3000);
    expect(campoPercentual.safeParse('33,333').success).toBe(false);
    // Achado 5: acima do int4 do banco é recusado antes de gravar (evita o erro 22003).
    expect(campoReais.safeParse('21.474.836,48').success).toBe(false);
    expect(campoReais.parse('21.474.836,47')).toBe(2147483647);
  });
  it('serviço: preço em centavos e duração inteira', () => {
    expect(
      esquemaFormularioServico.parse({ nome: ' Corte ', duracao_min: '45', preco: '80,00', ativo: true }),
    ).toEqual({ nome: 'Corte', duracao_min: 45, preco: 8000, ativo: true });
    expect(
      esquemaFormularioServico.safeParse({ nome: 'Corte', duracao_min: '45', preco: '80,005', ativo: true })
        .success,
    ).toBe(false);
    expect(
      esquemaFormularioServico.safeParse({ nome: 'Corte', duracao_min: '4,5', preco: '80', ativo: true }).success,
    ).toBe(false);
    expect(
      esquemaFormularioServico.safeParse({ nome: 'Corte', duracao_min: '2', preco: '80', ativo: true }).success,
    ).toBe(false); // mínimo 5 min (esquemaServico)
  });
  it('profissional: repasse em pontos-base', () => {
    expect(
      esquemaFormularioProfissional.parse({ especialidade: 'Manicure', percentual_repasse: '30', ativo: true }),
    ).toEqual({ especialidade: 'Manicure', percentual_repasse: 3000, ativo: true });
  });
  it('D41: padrões de repasse', () => {
    expect(REPASSE_PADRAO_PONTOS_BASE).toBe(2000);
    expect(REPASSE_ATENDO_SOZINHO_PONTOS_BASE).toBe(0);
  });
});

describe('D40: slug sugerido pelo nome', () => {
  it('tira acentos, espaços e símbolos', () => {
    expect(gerarSlug('Clínica Serena')).toBe('clinica-serena');
    expect(gerarSlug('  Estúdio  Ação & Cia.  ')).toBe('estudio-acao-cia');
    expect(gerarSlug('Barbearia do Zé 2')).toBe('barbearia-do-ze-2');
  });
  it('limita a 60 caracteres sem hífen no fim', () => {
    const s = gerarSlug(`${'a'.repeat(59)} b`);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });
  it('D44: a sugestão nunca propõe um slug reservado', () => {
    expect(gerarSlug('Conta')).toBe('conta-empresa');
    expect(gerarSlug('Clínicas')).toBe('clinicas-empresa');
    expect(gerarSlug('Super Admin')).toBe('super-admin-empresa');
    expect(gerarSlug('API')).toBe('api-empresa');
    for (const reservado of SLUGS_RESERVADOS) {
      expect(slugReservado(gerarSlug(reservado)), reservado).toBe(false);
    }
    expect(gerarSlug('Conta Bancária')).toBe('conta-bancaria'); // só o slug exato é reservado
  });
  it('D44: lista exata dos 13 reservados', () => {
    expect([...SLUGS_RESERVADOS].sort()).toEqual(
      ['admin', 'api', 'auth', 'cadastro', 'clinicas', 'conta', 'entrar', 'privacidade', 'profissional',
        'recuperar-senha', 'redefinir-senha', 'super-admin', 'trocar-senha'].sort(),
    );
  });
  it('nome só com símbolos gera vazio (o formulário pede para editar)', () => {
    expect(gerarSlug('!!!')).toBe('');
  });
});

describe('A1: erros do banco em português', () => {
  it('mensagens das RPCs do Wellbook', () => {
    const erro = { code: 'P0001', message: 'JA_ADMIN_DE_EMPRESA: Esta conta já administra uma empresa.' };
    expect(traduzirErroBanco(erro)).toBe('Esta conta já administra uma empresa.');
    expect(codigoErroWellbook(erro)).toBe('JA_ADMIN_DE_EMPRESA');
    expect(traduzirErroBanco({ message: 'CAMPO_PROTEGIDO: O link da clínica não pode ser alterado.' })).toBe(
      'O link da clínica não pode ser alterado.',
    );
  });
  it('códigos do Postgres', () => {
    expect(
      traduzirErroBanco({
        code: '23503',
        message: 'update or delete on table "profissionais" violates foreign key constraint',
      }),
    ).toBe('Este registro tem histórico e não pode ser excluído. Desative-o.');
    expect(traduzirErroBanco({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'Já existe um registro com esses dados.',
    );
    expect(traduzirErroBanco({ code: '23514', message: 'violates check constraint "tenants_whatsapp_check"' })).toBe(
      'Algum dado está fora do formato permitido. Confira os campos.',
    );
  });
  it('nunca devolve a mensagem crua em inglês', () => {
    expect(traduzirErroBanco({ message: 'new row violates row-level security policy' })).toBe(
      'Você não tem permissão para esta ação.',
    );
    expect(traduzirErroBanco({ message: 'something unexpected' })).toBe('Não foi possível concluir. Tente de novo.');
    expect(traduzirErroBanco(null)).toBe('Não foi possível concluir. Tente de novo.');
    expect(codigoErroWellbook({ message: 'something' })).toBeNull();
  });
});
