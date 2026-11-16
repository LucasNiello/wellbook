'use client';

import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarDays, LayoutDashboard, Palette, Scissors, Users } from 'lucide-react';
import { LISTA_TEMAS, TEMAS, variaveisCss } from '@wellbook/shared';
import { BotaoSair } from './BotaoSair';
import { AbasFluidas } from './animata/AbasFluidas';
import { AbaAgenda } from './painel-clinica/AbaAgenda';
import { AbaMinhaClinica } from './painel-clinica/AbaMinhaClinica';
import { AbaProfissionais } from './painel-clinica/AbaProfissionais';
import { AbaServicos } from './painel-clinica/AbaServicos';
import { AbaVisaoGeral } from './painel-clinica/AbaVisaoGeral';
import { ProvedorPainel, usePainel } from './painel-clinica/ContextoPainel';
import type { Aba, DadosPainel } from './painel-clinica/tipos';

export type { DadosPainel } from './painel-clinica/tipos';

const ABAS = [
  { id: 'visao', rotulo: 'Visão geral', icone: <LayoutDashboard size={16} /> },
  { id: 'clinica', rotulo: 'Minha clínica', icone: <Palette size={16} /> },
  { id: 'equipe', rotulo: 'Profissionais', icone: <Users size={16} /> },
  { id: 'servicos', rotulo: 'Serviços', icone: <Scissors size={16} /> },
  { id: 'agenda', rotulo: 'Agenda', icone: <CalendarDays size={16} /> },
] as const;

export function PainelClinica({ dadosIniciais }: { dadosIniciais: DadosPainel }) {
  const [aba, setAba] = useState<Aba>('visao');
  const [mensagem, setMensagem] = useState('');
  const [credencial, setCredencial] = useState<{ nome: string; senha: string } | null>(null);
  const mudarAba = (destino: Aba) => {
    setAba(destino);
    setMensagem('');
  };

  return (
    <ProvedorPainel dadosIniciais={dadosIniciais} setMensagem={setMensagem} setCredencial={setCredencial} mudarAba={mudarAba}>
      <CascaPainel aba={aba} mensagem={mensagem} credencial={credencial} setCredencial={setCredencial} />
    </ProvedorPainel>
  );
}

function CascaPainel({
  aba,
  mensagem,
  credencial,
  setCredencial,
}: {
  aba: Aba;
  mensagem: string;
  credencial: { nome: string; senha: string } | null;
  setCredencial: (valor: { nome: string; senha: string } | null) => void;
}) {
  const { dados, mudarAba } = usePainel();
  const reduzir = useReducedMotion();
  const temaAtual = LISTA_TEMAS.find((tema) => tema.id === dados.clinica.tema) ?? TEMAS.salvia;

  return (
    <div style={variaveisCss(temaAtual.id) as CSSProperties} className="min-h-screen bg-fundo text-texto">
      <div className="mx-auto max-w-[1500px] px-5 pb-20 pt-6 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borda pb-6">
          <div className="flex items-center gap-3">
            <Image
              src={temaAtual.tipo === 'escuro' ? '/imagens/wellbook/logo-claro.svg' : '/imagens/wellbook/logo-escuro.svg'}
              width={170}
              height={42}
              alt="Wellbook"
              priority
              className="h-10 w-auto"
            />
            <span className="border-l border-borda pl-3 text-[10px] font-semibold uppercase tracking-[.2em] text-texto-suave">Gestão da clínica</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-texto-suave sm:inline">Painel da clínica</span>
            <BotaoSair />
          </div>
        </header>
        <div className="mb-8 mt-9 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-primaria">
              <span className="h-px w-8 bg-primaria" /> Espaço de gestão
            </div>
            <h1 className="font-serif text-5xl tracking-tight md:text-6xl">
              {dados.clinica.nome}
              <span className="text-primaria">.</span>
            </h1>
            <p className="mt-3 text-sm text-texto-suave">Tudo o que sua clínica precisa, em um só lugar.</p>
          </div>
          <div className="rounded-full border border-borda bg-superficie px-4 py-2 text-xs text-texto-suave">
            ● {dados.clinica.ativo ? 'Clínica ativa' : 'Clínica desativada'}
          </div>
        </div>
        <div className="mb-8 overflow-x-auto">
          <AbasFluidas itens={ABAS} valor={aba} aoMudar={mudarAba} />
        </div>
        {mensagem && (
          <p role="status" className="mb-6 rounded-xl border border-borda bg-superficie-vitrine px-5 py-4 text-sm">
            {mensagem}
          </p>
        )}
        {credencial && (
          <div role="status" className="mb-6 rounded-2xl border border-primaria bg-superficie-vitrine p-5 text-sm">
            <strong>Conta de {credencial.nome} criada.</strong>
            <p className="mt-2">
              Senha provisória (exibida uma vez): <code className="rounded bg-fundo px-2 py-1 font-mono">{credencial.senha}</code>
            </p>
            <p className="mt-2 text-texto-suave">Entregue a senha em particular. A troca será exigida no primeiro acesso.</p>
            <button type="button" className="mt-3 text-primaria underline" onClick={() => setCredencial(null)}>
              Ocultar senha
            </button>
          </div>
        )}
        <motion.main key={aba} initial={reduzir ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduzir ? 0 : 0.32 }}>
          {aba === 'visao' && <AbaVisaoGeral />}
          {aba === 'clinica' && <AbaMinhaClinica />}
          {aba === 'equipe' && <AbaProfissionais />}
          {aba === 'servicos' && <AbaServicos />}
          {aba === 'agenda' && <AbaAgenda />}
        </motion.main>
        <footer className="mt-16 border-t border-borda pt-6 text-xs text-texto-suave">Wellbook · Gestão feita com cuidado</footer>
      </div>
    </div>
  );
}
