import { LinkTexto } from '../../components/ui';

/** RNF05 / D22: política de privacidade acessível. Texto RASCUNHO, a revisar pela equipe. */
export default function PaginaPrivacidade() {
  return (
    <main className="mx-auto max-w-2xl p-6 leading-relaxed">
      <p className="mb-2 inline-block rounded border border-borda px-2 text-sm font-semibold">
        RASCUNHO — revisar
      </p>
      <h1 className="mb-6 text-3xl font-semibold">Política de privacidade</h1>

      <h2 className="mt-6 text-xl font-semibold">Quais dados coletamos</h2>
      <p>
        Nome, e-mail e telefone informados no cadastro; os agendamentos que você faz (clínica, profissional, serviços,
        data e horário); e as observações que você escreve ao agendar.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Para que usamos</h2>
      <p>
        Para criar e gerenciar seus agendamentos, avisar sobre confirmações, cancelamentos e lembretes, e permitir que a
        clínica organize o atendimento.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Quem vê seus dados</h2>
      <p>
        A clínica em que você agendou vê seu nome, telefone e os dados do agendamento. As observações que você escreve
        são vistas apenas por você e pelo profissional que vai atender você; a administração da clínica não tem acesso
        a elas.
      </p>

      <h2 className="mt-6 text-xl font-semibold">Seus direitos</h2>
      <p>
        Você pode pedir a exclusão da sua conta. Seus dados pessoais serão anonimizados; os registros financeiros dos
        atendimentos já realizados permanecem com a clínica, sem identificar você.
      </p>

      <p className="mt-8">
        <LinkTexto href="/">Voltar</LinkTexto>
      </p>
    </main>
  );
}
