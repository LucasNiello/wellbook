'use client';

import { useState } from 'react';
import { gerarSlug, type ModoEmpresa } from '@wellbook/shared';
import { Campo } from './ui';

/**
 * Campos da empresa (D28–D30, D40), usados na porta Empresa do cadastro e no "Abrir minha
 * empresa" de /conta (D38). Os valores são lidos pelo formulário pai via FormData:
 * nomeEmpresa, slug, modo ('sozinho' | 'equipe') e especialidade.
 */
export function CamposEmpresa() {
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const [modo, setModo] = useState<ModoEmpresa | null>(null);

  return (
    <>
      <Campo
        rotulo="Nome da empresa"
        id="nomeEmpresa"
        required
        maxLength={120}
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          if (!slugEditado) setSlug(gerarSlug(e.target.value));
        }}
      />
      <Campo
        rotulo="Link da página (wellbook/…)"
        id="slug"
        required
        minLength={3}
        maxLength={60}
        placeholder="nome-da-empresa"
        value={slug}
        onChange={(e) => {
          setSlugEditado(true);
          setSlug(e.target.value.toLowerCase());
        }}
        aria-describedby="ajuda-slug"
      />
      <p id="ajuda-slug" className="-mt-3 mb-5 text-xs leading-5 text-texto-suave">
        Letras minúsculas, números e hífens. Se já existir, acrescentamos um número no fim. Depois de criado, o link não
        muda.
      </p>

      <fieldset className="mb-5">
        <legend className="mb-2 block text-sm font-medium text-texto">Você atende sozinho ou tem equipe?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['sozinho', 'Atendo sozinho', 'Você é o profissional da sua empresa.'],
              ['equipe', 'Tenho equipe', 'Você cadastra os profissionais depois.'],
            ] as const
          ).map(([valor, titulo, ajuda]) => (
            <label
              key={valor}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 text-sm transition ${
                modo === valor ? 'border-primaria bg-superficie-vitrine' : 'border-borda bg-superficie'
              }`}
            >
              <span className="flex items-center gap-2 font-medium text-texto">
                <input
                  type="radio"
                  name="modo"
                  value={valor}
                  required
                  checked={modo === valor}
                  onChange={() => setModo(valor)}
                  className="accent-primaria"
                />
                {titulo}
              </span>
              <span className="text-xs text-texto-suave">{ajuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {modo === 'sozinho' && (
        <Campo rotulo="Sua especialidade (ex.: Manicure, Psicóloga)" id="especialidade" required maxLength={80} />
      )}
    </>
  );
}

/** Lê os campos de CamposEmpresa de um FormData. */
export function lerCamposEmpresa(d: FormData) {
  const especialidade = d.get('especialidade');
  return {
    nomeEmpresa: d.get('nomeEmpresa'),
    slug: d.get('slug'),
    modo: d.get('modo'),
    especialidade: typeof especialidade === 'string' ? especialidade : undefined,
  };
}
