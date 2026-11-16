import { describe, expect, it } from 'vitest';
import {
  esquemaAbrirEmpresa,
  esquemaCadastro,
  esquemaCadastroEmpresa,
  parametrosCadastrarEmpresa,
  esquemaLogin,
  esquemaNovaSenha,
  esquemaTelefone,
  traduzirErroAuth,
} from './esquemas';
import { derivarPapeis, exigeLogin, papelExigido, podeAcessar, rotaInicial } from './papeis';
import { destinoSeguro } from './destino';

describe('destinoSeguro: sem redirecionamento aberto', () => {
  it('aceita caminhos internos (com busca)', () => {
    expect(destinoSeguro('/admin')).toBe('/admin');
    expect(destinoSeguro('/redefinir-senha?x=1')).toBe('/redefinir-senha?x=1');
  });
  it('recusa externos e truques', () => {
    for (const ruim of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/\tevil', '', null, undefined]) {
      expect(destinoSeguro(ruim)).toBe('/clinicas'); // D42: padrão passou de /conta para /clinicas
    }
  });
});

const cadastroValido = {
  nome: 'Carla Mendes',
  email: '  Carla@Example.com ',
  telefone: '(11) 95555-0000',
  senha: 'segredo123',
  confirmacaoSenha: 'segredo123',
  consentimentoLgpd: true as const,
};

describe('RF01/RNF05: cadastro do cliente', () => {
  it('aceita dados válidos e normaliza e-mail e telefone', () => {
    const r = esquemaCadastro.parse(cadastroValido);
    expect(r.email).toBe('carla@example.com');
    expect(r.telefone).toBe('11955550000');
  });
  it('recusa sem consentimento LGPD', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, consentimentoLgpd: false }).success).toBe(false);
  });
  it('recusa senha curta e confirmação diferente', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, senha: 'curta', confirmacaoSenha: 'curta' }).success).toBe(false);
    expect(esquemaCadastro.safeParse({ ...cadastroValido, confirmacaoSenha: 'outra-senha' }).success).toBe(false);
  });
  it('recusa nome vazio e e-mail inválido', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, nome: '   ' }).success).toBe(false);
    expect(esquemaCadastro.safeParse({ ...cadastroValido, email: 'sem-arroba' }).success).toBe(false);
  });
  it('telefone exige DDD (10 ou 11 dígitos)', () => {
    expect(esquemaTelefone.safeParse('95555-0000').success).toBe(false);
    expect(esquemaTelefone.parse('11 3333-4444')).toBe('1133334444');
  });
});

describe('RF02/RF05/D20: login e nova senha', () => {
  it('login exige e-mail válido e senha preenchida', () => {
    expect(esquemaLogin.safeParse({ email: 'a@b.com', senha: '' }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: 'a@b.com', senha: 'x' }).success).toBe(true);
  });
  it('nova senha exige mínimo e confirmação igual', () => {
    expect(esquemaNovaSenha.safeParse({ senha: 'abcdefgh', confirmacaoSenha: 'abcdefgh' }).success).toBe(true);
    expect(esquemaNovaSenha.safeParse({ senha: 'abcdefgh', confirmacaoSenha: 'abcdefgX' }).success).toBe(false);
  });
  it('erro de login não revela se o e-mail existe', () => {
    expect(traduzirErroAuth('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
    expect(traduzirErroAuth('algo inesperado')).toBe('Não foi possível concluir. Tente de novo.');
  });
});

describe('papéis e proteção de rotas', () => {
  const T = 'tenant-a';
  it('cliente puro vai para a lista de clínicas (D21, D42)', () => {
    const r = derivarPapeis({ superAdmin: false, tenantsAdmin: [], profissionais: [] });
    expect(r.papeis).toEqual(['cliente']);
    expect(rotaInicial(r.papeis)).toBe('/clinicas'); // D21/D42 (era /conta: o cliente ficava preso no perfil)
  });
  it('admin que também atende (§7.1, D10) tem os dois papéis e começa no /admin', () => {
    const r = derivarPapeis({ superAdmin: false, tenantsAdmin: [T], profissionais: [{ tenantId: T, ativo: true }] });
    expect(r.papeis).toEqual(['admin', 'profissional', 'cliente']);
    expect(r.tenantAdmin).toBe(T);
    expect(r.tenantProfissional).toBe(T);
    expect(rotaInicial(r.papeis)).toBe('/admin');
  });
  it('profissional desativado perde o papel profissional, mas não é cliente puro', () => {
    const r = derivarPapeis({ superAdmin: false, tenantsAdmin: [], profissionais: [{ tenantId: T, ativo: false }] });
    expect(r.papeis).toEqual(['cliente']);
    expect(r.tenantProfissional).toBeNull();
    expect(r.clientePuro).toBe(false); // cosmético 8: sem "Abrir minha empresa" nem "Excluir conta"
  });
  it('clientePuro só para quem não tem nenhum vínculo', () => {
    expect(derivarPapeis({ superAdmin: false, tenantsAdmin: [], profissionais: [] }).clientePuro).toBe(true);
    expect(derivarPapeis({ superAdmin: true, tenantsAdmin: [], profissionais: [] }).clientePuro).toBe(false);
    expect(derivarPapeis({ superAdmin: false, tenantsAdmin: [T], profissionais: [] }).clientePuro).toBe(false);
    expect(
      derivarPapeis({ superAdmin: false, tenantsAdmin: [], profissionais: [{ tenantId: T, ativo: true }] }).clientePuro,
    ).toBe(false);
  });
  it('super admin começa no /super-admin', () => {
    const r = derivarPapeis({ superAdmin: true, tenantsAdmin: [], profissionais: [] });
    expect(rotaInicial(r.papeis)).toBe('/super-admin');
  });
  it('rotas por papel', () => {
    expect(papelExigido('/admin')).toBe('admin');
    expect(papelExigido('/admin/servicos')).toBe('admin');
    expect(papelExigido('/administrador')).toBeNull();
    expect(papelExigido('/profissional/agenda')).toBe('profissional');
    expect(papelExigido('/clinica-serena')).toBeNull();
    expect(podeAcessar('/admin', ['profissional', 'cliente'])).toBe(false);
    expect(podeAcessar('/admin', ['admin', 'cliente'])).toBe(true);
    expect(podeAcessar('/entrar', ['cliente'])).toBe(true);
  });
  it('rotas que exigem login', () => {
    expect(exigeLogin('/conta')).toBe(true);
    expect(exigeLogin('/trocar-senha')).toBe(true);
    expect(exigeLogin('/super-admin')).toBe(true);
    expect(exigeLogin('/entrar')).toBe(false);
    expect(exigeLogin('/')).toBe(false);
  });
});

describe('D28/D29/D30/D32: cadastro pela porta Empresa', () => {
  const empresa = {
    ...cadastroValido,
    nomeEmpresa: 'Estúdio Aurora',
    slug: 'estudio-aurora',
    modo: 'equipe' as const,
  };
  it('modo equipe não exige especialidade', () => {
    const r = esquemaCadastroEmpresa.parse(empresa);
    expect(parametrosCadastrarEmpresa(r)).toEqual({
      p_nome: 'Estúdio Aurora',
      p_slug: 'estudio-aurora',
      p_atendo_sozinho: false,
      p_especialidade: null,
    });
  });
  it('modo sozinho (D30) exige especialidade e liga o atendo sozinho', () => {
    expect(esquemaCadastroEmpresa.safeParse({ ...empresa, modo: 'sozinho' }).success).toBe(false);
    const r = esquemaCadastroEmpresa.parse({ ...empresa, modo: 'sozinho', especialidade: ' Manicure ' });
    expect(parametrosCadastrarEmpresa(r)).toMatchObject({ p_atendo_sozinho: true, p_especialidade: 'Manicure' });
  });
  it('D32: a porta Empresa também exige o consentimento LGPD', () => {
    expect(esquemaCadastroEmpresa.safeParse({ ...empresa, consentimentoLgpd: false }).success).toBe(false);
  });
  it('sem CNPJ nem CRM (D30): campos extras são ignorados, não exigidos', () => {
    const r = esquemaCadastroEmpresa.parse({ ...empresa, cnpj: '00.000.000/0001-00' });
    expect(r).not.toHaveProperty('cnpj');
  });
  it('D44: slug reservado é recusado no cadastro de empresa e no abrir empresa', () => {
    for (const slug of ['admin', 'conta', 'clinicas', 'super-admin', 'api']) {
      expect(esquemaCadastroEmpresa.safeParse({ ...empresa, slug }).success, slug).toBe(false);
      expect(esquemaAbrirEmpresa.safeParse({ nomeEmpresa: 'X Y', slug, modo: 'equipe' }).success, slug).toBe(false);
    }
    expect(esquemaCadastroEmpresa.safeParse({ ...empresa, slug: 'conta-empresa' }).success).toBe(true);
  });
  it('slug inválido e senhas diferentes são recusados', () => {
    expect(esquemaCadastroEmpresa.safeParse({ ...empresa, slug: 'Com Espaço' }).success).toBe(false);
    expect(esquemaCadastroEmpresa.safeParse({ ...empresa, slug: 'ab' }).success).toBe(false);
    expect(esquemaCadastroEmpresa.safeParse({ ...empresa, confirmacaoSenha: 'outra-coisa' }).success).toBe(false);
  });
  it('D38: cliente logado abre empresa só com os dados da empresa', () => {
    expect(
      esquemaAbrirEmpresa.safeParse({ nomeEmpresa: 'Barbearia', slug: 'barbearia', modo: 'equipe' }).success,
    ).toBe(true);
    expect(esquemaAbrirEmpresa.safeParse({ nomeEmpresa: 'B', slug: 'barbearia', modo: 'equipe' }).success).toBe(false);
  });
});
