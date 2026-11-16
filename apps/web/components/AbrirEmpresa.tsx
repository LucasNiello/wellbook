'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  esquemaAbrirEmpresa,
  parametrosCadastrarEmpresa,
  primeiraMensagem,
  ROTA_DO_PAPEL,
  traduzirErroBanco,
} from '@wellbook/shared';
import { criarClienteNavegador } from '../lib/supabase/navegador';
import { CamposEmpresa, lerCamposEmpresa } from './CamposEmpresa';
import { Aviso, BotaoPrimario } from './ui';

/** D38: o cliente que já tem conta abre uma empresa (mesma RPC da porta Empresa — D29). */
export function AbrirEmpresa() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const r = esquemaAbrirEmpresa.safeParse(lerCamposEmpresa(new FormData(evento.currentTarget)));
    if (!r.success) return setErro(primeiraMensagem(r.error));
    setCarregando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().rpc('cadastrar_empresa', parametrosCadastrarEmpresa(r.data));
    if (error) {
      setCarregando(false);
      return setErro(traduzirErroBanco(error));
    }
    router.replace(ROTA_DO_PAPEL.admin);
    router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-borda px-4 text-sm text-primaria transition hover:border-primaria focus-visible:outline-2 focus-visible:outline-primaria"
      >
        Abrir minha empresa
      </button>
    );
  }
  return (
    <form onSubmit={enviar} noValidate className="mt-2 rounded-2xl border border-borda bg-fundo p-5 sm:col-span-2">
      <p className="mb-5 text-sm leading-6 text-texto-suave">
        Você vira o administrador da empresa. Uma empresa por conta; sem CNPJ.
      </p>
      <Aviso texto={erro} />
      <CamposEmpresa />
      <BotaoPrimario carregando={carregando}>Criar empresa</BotaoPrimario>
    </form>
  );
}
