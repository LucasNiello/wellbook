'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { criarClienteNavegador } from '../lib/supabase/navegador';
import { Aviso } from './ui';

/** Em resposta não-2xx, o corpo da Edge Function ({ erro }) vem em `error.context` (Response). */
async function mensagemDoServidor(erro: unknown): Promise<string | null> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response)) return null;
  try {
    const corpo = (await contexto.json()) as { erro?: unknown };
    return typeof corpo.erro === 'string' ? corpo.erro : null;
  } catch {
    return null;
  }
}

/**
 * D22 / RNF05: exclusão da conta do cliente, com confirmação em dois passos.
 * Chama a Edge Function `excluir-conta` (que valida o usuário, anonimiza pela RPC e remove do Auth).
 */
export function BotaoExcluirConta() {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function excluir() {
    setCarregando(true);
    setErro(null);
    const supabase = criarClienteNavegador();
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; erro?: string }>('excluir-conta', {
      method: 'POST',
    });
    if (error || !data?.ok) {
      setCarregando(false);
      return setErro((await mensagemDoServidor(error)) ?? data?.erro ?? 'Não foi possível excluir a conta agora. Tente de novo.');
    }
    await supabase.auth.signOut();
    router.replace('/?conta=excluida');
    router.refresh();
  }

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-texto-suave underline">
        Excluir minha conta
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <Aviso texto={erro} />
      <p className="mb-2 font-medium text-texto">Excluir sua conta?</p>
      <ul className="mb-4 list-disc pl-5 text-texto-suave">
        <li>Seus agendamentos futuros serão cancelados.</li>
        <li>As observações que você escreveu serão apagadas.</li>
        <li>Seu nome, e-mail e telefone serão removidos.</li>
        <li>Os registros financeiros dos atendimentos já realizados ficam com a clínica, sem identificar você.</li>
        <li>Não é possível desfazer.</li>
      </ul>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={excluir}
          disabled={carregando}
          className="rounded-lg bg-primaria px-4 py-2 text-texto-sobre-primaria disabled:opacity-60"
        >
          {carregando ? 'Excluindo…' : 'Sim, excluir minha conta'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={carregando}
          className="rounded-lg border border-borda px-4 py-2 text-texto"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
