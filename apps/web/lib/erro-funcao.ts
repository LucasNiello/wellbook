/** Mostra a mensagem controlada pela Edge Function, sem expor detalhes internos. */
export async function erroFuncao(falha: unknown): Promise<Error> {
  const resposta = (falha as { context?: unknown } | null)?.context;
  if (resposta instanceof Response) {
    try {
      const corpo = await resposta.clone().json() as { erro?: unknown };
      if (typeof corpo.erro === 'string') return new Error(corpo.erro);
    } catch { /* resposta sem JSON */ }
  }
  return new Error(falha instanceof Error ? falha.message : 'Não foi possível concluir a operação.');
}
