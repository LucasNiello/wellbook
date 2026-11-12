import { describe, expect, it } from 'vitest';
import {
  esquemaCadastro,
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
      expect(destinoSeguro(ruim)).toBe('/conta');
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
  it('cliente puro', () => {
    const r = derivarPapeis({ superAdmin: false, tenantsAdmin: [], profissionais: [] });
    expect(r.papeis).toEqual(['cliente']);
    expect(rotaInicial(r.papeis)).toBe('/conta');
  });
  it('admin que também atende (§7.1, D10) tem os dois papéis e começa no /admin', () => {
    const r = derivarPapeis({ superAdmin: false, tenantsAdmin: [T], profissionais: [{ tenantId: T, ativo: true }] });
    expect(r.papeis).toEqual(['admin', 'profissional', 'cliente']);
    expect(r.tenantAdmin).toBe(T);
    expect(r.tenantProfissional).toBe(T);
    expect(rotaInicial(r.papeis)).toBe('/admin');
  });
  it('profissional desativado perde o papel profissional', () => {
    const r = derivarPapeis({ superAdmin: false, tenantsAdmin: [], profissionais: [{ tenantId: T, ativo: false }] });
    expect(r.papeis).toEqual(['cliente']);
    expect(r.tenantProfissional).toBeNull();
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
