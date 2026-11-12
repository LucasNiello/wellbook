import { BotaoSair } from './BotaoSair';
import { LinkTexto } from './ui';

/** Área por papel só para provar a proteção de rotas (Fase 3). O conteúdo chega nas fases seguintes. */
export function AreaProvisoria({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-semibold">{titulo}</h1>
      <p className="text-texto-suave">Conteúdo na {fase}.</p>
      <div className="mt-6 flex gap-4 text-sm">
        <LinkTexto href="/conta">Minha conta</LinkTexto>
        <BotaoSair />
      </div>
    </main>
  );
}
