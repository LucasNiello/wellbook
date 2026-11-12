import { redirect } from 'next/navigation';
import { ROTA_DO_PAPEL, type Papel } from '@wellbook/shared';
import { criarClienteServidor } from '../../lib/supabase/servidor';
import { carregarPerfil } from '../../lib/perfil';
import { BotaoSair } from '../../components/BotaoSair';
import { LinkTexto } from '../../components/ui';

const NOME_DO_PAPEL: Readonly<Record<Papel, string>> = {
  super_admin: 'Super Admin',
  admin: 'Administrador(a) da clínica',
  profissional: 'Profissional',
  cliente: 'Cliente',
};

/** Minha conta: perfil e papéis carregados do banco (RLS). */
export default async function PaginaConta() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');
  const perfil = await carregarPerfil(supabase, user.id);
  if (!perfil) redirect('/entrar');

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-semibold">Minha conta</h1>
      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-texto-suave">Nome</dt>
            <dd>{perfil.nome}</dd>
          </div>
          <div>
            <dt className="text-sm text-texto-suave">E-mail</dt>
            <dd>{perfil.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-texto-suave">Telefone</dt>
            <dd>{perfil.telefone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-texto-suave">Perfis</dt>
            <dd>
              <ul className="mt-1 flex flex-wrap gap-2">
                {perfil.papeis.map((p) => (
                  <li key={p}>
                    {p === 'cliente' ? (
                      <span className="rounded-full border border-borda px-3 py-1 text-sm">{NOME_DO_PAPEL[p]}</span>
                    ) : (
                      <a
                        href={ROTA_DO_PAPEL[p]}
                        className="rounded-full bg-primaria px-3 py-1 text-sm text-texto-sobre-primaria"
                      >
                        {NOME_DO_PAPEL[p]}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 space-y-3 text-sm">
        <p>
          <LinkTexto href="/privacidade">Política de privacidade</LinkTexto>
        </p>
        <p>
          <button type="button" disabled className="cursor-not-allowed text-texto-suave">
            Excluir minha conta (em breve)
          </button>
        </p>
        <BotaoSair />
      </section>
    </main>
  );
}
