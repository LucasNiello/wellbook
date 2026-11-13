import { CartaoAuth, LinkTexto } from '../../components/ui';
import { FormularioNovaSenha } from '../../components/FormularioNovaSenha';

/** RF05: o link do e-mail passa por /auth/callback (cria a sessão) e chega aqui. */
export default function PaginaRedefinirSenha() {
  return (
    <CartaoAuth
      titulo="Criar nova senha"
      descricao="Escolha uma senha para voltar a acessar sua conta com segurança."
      rodape={
        <p>
          <LinkTexto href="/recuperar-senha">Pedir outro link</LinkTexto>
        </p>
      }
    >
      <FormularioNovaSenha textoBotao="Salvar nova senha" />
    </CartaoAuth>
  );
}
