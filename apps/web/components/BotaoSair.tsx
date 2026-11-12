'use client';

import { useRouter } from 'next/navigation';
import { criarClienteNavegador } from '../lib/supabase/navegador';

export function BotaoSair() {
  const router = useRouter();
  async function sair() {
    await criarClienteNavegador().auth.signOut();
    router.replace('/');
    router.refresh();
  }
  return (
    <button type="button" onClick={sair} className="text-primaria underline-offset-2 hover:underline">
      Sair
    </button>
  );
}
