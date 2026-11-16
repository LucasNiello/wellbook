'use client';

import { ImagePlus, Sparkles } from 'lucide-react';
import { usePainel } from './ContextoPainel';
import { TituloSecao } from './Secao';
import { secundario } from './estilos';

export function EnvioLogo() {
  const { dados, tenantId, supabase, executar, erro, setDados } = usePainel();

  async function enviarLogo(arquivo?: File) {
    if (!arquivo) return;
    await executar(async () => {
      if (arquivo.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) throw new Error('Use PNG, JPG ou WebP de até 2 MB.');
      const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${tenantId}/logo-${crypto.randomUUID()}.${extensao}`;
      const envio = await supabase.storage.from('logos').upload(caminho, arquivo);
      erro(envio.error);
      const url = supabase.storage.from('logos').getPublicUrl(caminho).data.publicUrl;
      const gravacao = await supabase.from('tenants').update({ logo_url: url }).eq('id', tenantId);
      erro(gravacao.error);
      setDados((atual) => ({ ...atual, clinica: { ...atual.clinica, logo_url: url } }));
    }, 'Logo atualizado.');
  }

  return (
    <div className="rounded-3xl border border-borda bg-superficie p-7">
      <TituloSecao etiqueta="Assinatura visual" titulo="Logo da clínica" descricao="PNG, JPG ou WebP de até 2 MB." />
      <div className="mt-6 flex items-center gap-5">
        <div className="grid size-24 place-items-center overflow-hidden rounded-2xl border border-borda bg-superficie-vitrine">
          {dados.clinica.logo_url ? (
            <img src={dados.clinica.logo_url} alt={`Logo de ${dados.clinica.nome}`} className="size-full object-contain" />
          ) : (
            <Sparkles size={30} className="text-primaria" />
          )}
        </div>
        <label className={`${secundario} cursor-pointer`}>
          <ImagePlus size={17} /> Enviar logo
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void enviarLogo(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}
