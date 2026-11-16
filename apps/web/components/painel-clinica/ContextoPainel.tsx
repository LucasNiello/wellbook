'use client';

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { traduzirErroBanco, type ErroBanco, type IdTema } from '@wellbook/shared';
import { criarClienteNavegador } from '../../lib/supabase/navegador';
import type { Aba, DadosPainel, FormClinica } from './tipos';

type ValorPainel = {
  dados: DadosPainel;
  setDados: Dispatch<SetStateAction<DadosPainel>>;
  /** Vem dos dados carregados no servidor; nunca de campo editável. */
  tenantId: string;
  usuarioId: string;
  supabase: ReturnType<typeof criarClienteNavegador>;
  ocupado: boolean;
  setOcupado: Dispatch<SetStateAction<boolean>>;
  setMensagem: Dispatch<SetStateAction<string>>;
  avisar: (texto: string) => void;
  erro: (falha: ErroBanco | null) => void;
  /** `aoConcluir` roda depois do aviso de sucesso (usado para fechar o modal da aba). */
  executar: (acao: () => Promise<void>, sucesso: string, aoConcluir?: () => void) => Promise<void>;
  mudarAba: (destino: Aba) => void;
  formClinica: FormClinica;
  setFormClinica: Dispatch<SetStateAction<FormClinica>>;
  temaPreview: IdTema;
  setTemaPreview: Dispatch<SetStateAction<IdTema>>;
  setCredencial: Dispatch<SetStateAction<{ nome: string; senha: string } | null>>;
};

const Contexto = createContext<ValorPainel | null>(null);

export function usePainel(): ValorPainel {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('usePainel deve ser usado dentro do ProvedorPainel.');
  return valor;
}

export function ProvedorPainel({
  dadosIniciais,
  setMensagem,
  setCredencial,
  mudarAba,
  children,
}: {
  dadosIniciais: DadosPainel;
  setMensagem: Dispatch<SetStateAction<string>>;
  setCredencial: Dispatch<SetStateAction<{ nome: string; senha: string } | null>>;
  mudarAba: (destino: Aba) => void;
  children: ReactNode;
}) {
  const [dados, setDados] = useState(dadosIniciais);
  const [ocupado, setOcupado] = useState(false);
  const [temaPreview, setTemaPreview] = useState<IdTema>(dadosIniciais.clinica.tema as IdTema);
  const [formClinica, setFormClinica] = useState<FormClinica>({
    nome: dadosIniciais.clinica.nome,
    whatsapp: dadosIniciais.clinica.whatsapp ?? '',
    endereco: dadosIniciais.clinica.endereco ?? '',
    prazo: String(dadosIniciais.clinica.prazo_cancelamento_min),
  });
  const supabase = useMemo(criarClienteNavegador, []);

  const avisar = (texto: string) => {
    setMensagem(texto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // A1: nenhuma mensagem crua do banco (em inglês) chega à tela; 23503 vira "desative" (D17).
  const erro = (falha: ErroBanco | null) => {
    if (falha) throw new Error(traduzirErroBanco(falha));
  };

  async function executar(acao: () => Promise<void>, sucesso: string, aoConcluir?: () => void) {
    setOcupado(true);
    setMensagem('');
    try {
      await acao();
      avisar(sucesso);
      aoConcluir?.();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Contexto.Provider
      value={{
        dados, setDados, tenantId: dadosIniciais.clinica.id, usuarioId: dadosIniciais.usuarioId, supabase,
        ocupado, setOcupado, setMensagem, avisar, erro, executar, mudarAba,
        formClinica, setFormClinica, temaPreview, setTemaPreview, setCredencial,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}
