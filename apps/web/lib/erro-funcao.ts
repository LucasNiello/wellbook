/** Mostra a mensagem controlada pela Edge Function, sem expor detalhes internos. */
export async function erroFuncao(falha: unknown): Promise<Error> {
  const resposta = (falha as { context?: unknown } | null)?.context;
  if (resposta instanceof Response) {
    try {
      const corpo = await resposta.clone().json() as { erro?: unknown };
      if (typeof corpo.erro === 'string') return new Error(corpo.erro);
    } catch { /* resposta sem JSON */ }
  }
  // A1: a mensagem do cliente supabase-js é em inglês ("Edge Function returned a non-2xx…").
  return new Error('Não foi possível concluir a operação. Verifique a conexão e tente novamente.');
}
