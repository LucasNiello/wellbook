/**
 * Schemas Zod das telas de autenticação (Fase 3: RF01, RF02, RF05, RNF05, D20).
 * Usados igualmente no web e no mobile.
 */
import { z } from 'zod';
import { slugReservado } from '../regras/slug';

/** Tamanho mínimo da senha (o mesmo configurado no Supabase Auth: 8). */
export const SENHA_MINIMA = 8;

export const esquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Informe um e-mail válido.' }));

export const esquemaSenha = z
  .string()
  .min(SENHA_MINIMA, { message: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` })
  .max(72, { message: 'A senha pode ter no máximo 72 caracteres.' });

/** Telefone brasileiro: só dígitos, 10 ou 11 (DDD + número). Espelha o limite de 20 do banco. */
export const esquemaTelefone = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{10,11}$/, { message: 'Informe o telefone com DDD.' }));

export const esquemaLogin = z.object({
  email: esquemaEmail,
  senha: z.string().min(1, { message: 'Informe a senha.' }),
});

const camposCadastroPessoa = {
  nome: z.string().trim().min(1, { message: 'Informe seu nome.' }).max(120),
  email: esquemaEmail,
  telefone: esquemaTelefone,
  senha: esquemaSenha,
  confirmacaoSenha: z.string(),
  consentimentoLgpd: z.literal(true, {
    message: 'É preciso aceitar a política de privacidade para criar a conta.',
  }),
};

const senhasConferem = {
  check: (d: { senha: string; confirmacaoSenha: string }) => d.senha === d.confirmacaoSenha,
  params: { message: 'As senhas não conferem.', path: ['confirmacaoSenha'] },
};

/** RF01 + RNF05: cadastro do cliente exige consentimento explícito (porta Cliente — D28). */
export const esquemaCadastro = z
  .object(camposCadastroPessoa)
  .refine(senhasConferem.check, senhasConferem.params);

// Empresa (D28, D29, D30, D37, D40) ------------------------------------------------------------
export const MODOS_EMPRESA = ['sozinho', 'equipe'] as const;
export type ModoEmpresa = (typeof MODOS_EMPRESA)[number];

const camposEmpresa = {
  nomeEmpresa: z
    .string()
    .trim()
    .min(2, { message: 'Informe o nome da empresa (mínimo 2 caracteres).' })
    .max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: 'O link precisa ter pelo menos 3 caracteres.' })
    .max(60, { message: 'O link pode ter no máximo 60 caracteres.' })
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Use só letras minúsculas, números e hífens no link.' })
    .refine((s) => !slugReservado(s), { message: 'Este link é reservado pelo Wellbook. Escolha outro.' }), // D44
  modo: z.enum(MODOS_EMPRESA, { message: 'Diga se você atende sozinho ou tem equipe.' }),
  especialidade: z.string().trim().max(80).optional(),
};

const especialidadeNoModoSozinho = {
  check: (d: { modo: ModoEmpresa; especialidade?: string | undefined }) =>
    d.modo === 'equipe' || (d.especialidade ?? '').length >= 2,
  params: {
    message: 'Informe sua especialidade (ex.: Manicure, Psicóloga).',
    path: ['especialidade'],
  },
};

/** D38: o usuário já logado abre uma empresa (tela /conta). */
export const esquemaAbrirEmpresa = z
  .object(camposEmpresa)
  .refine(especialidadeNoModoSozinho.check, especialidadeNoModoSozinho.params);

/** D28 + D32: porta Empresa — dados da pessoa (com consentimento LGPD) + dados da empresa. */
export const esquemaCadastroEmpresa = z
  .object({ ...camposCadastroPessoa, ...camposEmpresa })
  .refine(senhasConferem.check, senhasConferem.params)
  .refine(especialidadeNoModoSozinho.check, especialidadeNoModoSozinho.params);

export type DadosAbrirEmpresa = z.infer<typeof esquemaAbrirEmpresa>;
export type DadosCadastroEmpresa = z.infer<typeof esquemaCadastroEmpresa>;

/** Parâmetros da RPC public.cadastrar_empresa (mesmo formato no web e no mobile). */
export function parametrosCadastrarEmpresa(d: DadosAbrirEmpresa): {
  p_nome: string;
  p_slug: string;
  p_atendo_sozinho: boolean;
  p_especialidade: string | null;
} {
  return {
    p_nome: d.nomeEmpresa,
    p_slug: d.slug,
    p_atendo_sozinho: d.modo === 'sozinho',
    p_especialidade: d.modo === 'sozinho' ? (d.especialidade ?? null) : null,
  };
}

export const esquemaRecuperarSenha = z.object({ email: esquemaEmail });

/** RF05 (redefinição pelo link) e D20 (troca obrigatória no 1º login). */
export const esquemaNovaSenha = z
  .object({ senha: esquemaSenha, confirmacaoSenha: z.string() })
  .refine((d) => d.senha === d.confirmacaoSenha, {
    message: 'As senhas não conferem.',
    path: ['confirmacaoSenha'],
  });

export type DadosLogin = z.infer<typeof esquemaLogin>;
export type DadosCadastro = z.infer<typeof esquemaCadastro>;
export type DadosNovaSenha = z.infer<typeof esquemaNovaSenha>;

/** Primeira mensagem de erro de um resultado Zod, para exibir no formulário. */
export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? 'Dados inválidos.';
}

/**
 * Traduz as mensagens do Supabase Auth mais comuns para português.
 * Nunca revela se um e-mail existe (mensagem genérica no login).
 */
export function traduzirErroAuth(mensagem: string | undefined): string {
  const m = (mensagem ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.';
  if (m.includes('password should be') || m.includes('weak password'))
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (m.includes('same password') || m.includes('different from the old'))
    return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexão. Verifique a internet.';
  return 'Não foi possível concluir. Tente de novo.';
}
