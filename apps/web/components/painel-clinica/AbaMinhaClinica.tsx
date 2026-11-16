'use client';

import type { FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { esquemaTenant, primeiraMensagem } from '@wellbook/shared';
import { Campo } from './Campo';
import { usePainel } from './ContextoPainel';
import { EnvioLogo } from './EnvioLogo';
import { TituloSecao } from './Secao';
import { SeletorTema } from './SeletorTema';
import { botao, estiloCampo } from './estilos';

export function AbaMinhaClinica() {
  const { dados, tenantId, supabase, ocupado, executar, erro, setDados, formClinica, setFormClinica } = usePainel();

  async function salvarClinica(evento: FormEvent) {
    evento.preventDefault();
    await executar(async () => {
      // A1/A2: valida com o schema do shared antes de gravar (WhatsApp, prazo inteiro).
      const r = esquemaTenant
        .pick({ nome: true, whatsapp: true, endereco: true, prazo_cancelamento_min: true })
        .safeParse({
          nome: formClinica.nome,
          whatsapp: formClinica.whatsapp.replace(/\D/g, '') || null,
          endereco: formClinica.endereco.trim() || null,
          prazo_cancelamento_min: /^\d+$/.test(formClinica.prazo.trim()) ? Number.parseInt(formClinica.prazo, 10) : Number.NaN,
        });
      if (!r.success) throw new Error(primeiraMensagem(r.error));
      const valores = r.data;
      const { error } = await supabase.from('tenants').update(valores).eq('id', tenantId);
      erro(error);
      setDados((atual) => ({ ...atual, clinica: { ...atual.clinica, ...valores } }));
    }, 'Dados da clínica atualizados.');
  }

  return (
    <div className="grid gap-7 xl:grid-cols-[1fr_1fr]">
      <section className="rounded-3xl border border-borda bg-superficie p-7">
        <TituloSecao etiqueta="Identidade" titulo="Dados da clínica" descricao="Informações usadas no perfil e nas regras de agendamento." />
        {/* D40: o link final (pode ter recebido -2, -3…) é fixo depois de criado. */}
        <p className="mt-4 text-sm text-texto-suave">
          Link da página: <strong className="text-texto">/{dados.clinica.slug}</strong> (não muda depois de criado)
        </p>
        <form onSubmit={salvarClinica} className="mt-7 space-y-5">
          <Campo titulo="Nome da clínica">
            <input className={estiloCampo} maxLength={120} minLength={2} required value={formClinica.nome} onChange={(e) => setFormClinica({ ...formClinica, nome: e.target.value })} />
          </Campo>
          <Campo titulo="WhatsApp">
            <input className={estiloCampo} inputMode="tel" placeholder="Somente números, com DDD" value={formClinica.whatsapp} onChange={(e) => setFormClinica({ ...formClinica, whatsapp: e.target.value })} />
          </Campo>
          <Campo titulo="Endereço">
            <input className={estiloCampo} maxLength={300} value={formClinica.endereco} onChange={(e) => setFormClinica({ ...formClinica, endereco: e.target.value })} />
          </Campo>
          <Campo titulo="Prazo de cancelamento do cliente (minutos)">
            <input className={estiloCampo} type="number" min={0} max={43200} value={formClinica.prazo} onChange={(e) => setFormClinica({ ...formClinica, prazo: e.target.value })} />
          </Campo>
          <p className="text-xs text-texto-suave">0 permite cancelar ou remarcar sem antecedência mínima.</p>
          <button disabled={ocupado} className={botao} type="submit">
            Salvar alterações <ArrowRight size={16} />
          </button>
        </form>
      </section>
      <section className="space-y-7">
        <EnvioLogo />
        <SeletorTema />
      </section>
    </div>
  );
}
