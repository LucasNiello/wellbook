export function TituloSecao({ etiqueta, titulo, descricao }: { etiqueta: string; titulo: string; descricao: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primaria">{etiqueta}</p>
      <h2 className="mt-2 font-serif text-4xl">{titulo}</h2>
      <p className="mt-3 text-sm leading-6 text-texto-suave">{descricao}</p>
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-borda p-12 text-center text-sm text-texto-suave">
      {texto}
    </div>
  );
}
