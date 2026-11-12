import { Tela, Texto, Titulo } from '../componentes/ui';

export default function Privacidade() {
  return (
    <Tela>
      <Titulo>Política de privacidade</Titulo>
      <Texto suave>RASCUNHO — revisar</Texto>
      <Texto>
        Dados coletados: nome, e-mail, telefone, seus agendamentos e as observações que você
        escreve ao agendar. As observações são visíveis somente para você e para o profissional do
        atendimento.
      </Texto>
      <Texto>
        Finalidade: permitir o agendamento e a gestão dos atendimentos nas clínicas que usam o
        Wellbook, e enviar avisos e lembretes sobre seus agendamentos.
      </Texto>
      <Texto>
        Direito de exclusão: você pode pedir a exclusão da sua conta. Seus dados pessoais serão
        anonimizados; os registros financeiros das clínicas são mantidos sem identificar você.
      </Texto>
    </Tela>
  );
}
