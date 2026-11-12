/**
 * Erro de regra de negócio. O `codigo` é estável (usado nos testes e na interface);
 * a `message` é o texto em português para exibição.
 * Os mesmos códigos são usados nas mensagens de erro das RPCs do banco.
 */
export type CodigoErro =
  | 'VALOR_INVALIDO'
  | 'LIQUIDO_NEGATIVO'
  | 'PERCENTUAL_INVALIDO'
  | 'TRANSICAO_INVALIDA'
  | 'ESTADO_FINAL'
  | 'ANTES_DO_INICIO'
  | 'PRAZO_CANCELAMENTO'
  | 'PAPEL_SEM_PERMISSAO'
  | 'DURACAO_INVALIDA'
  | 'DATA_INVALIDA'
  | 'HORA_INVALIDA';

export class ErroRegraNegocio extends Error {
  readonly codigo: CodigoErro;

  constructor(codigo: CodigoErro, mensagem: string) {
    super(mensagem);
    this.name = 'ErroRegraNegocio';
    this.codigo = codigo;
  }
}
