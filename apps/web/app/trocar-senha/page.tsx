import { CartaoAuth } from '../../components/ui';
import { FormularioNovaSenha } from '../../components/FormularioNovaSenha';
import { BotaoSair } from '../../components/BotaoSair';

/** D20: no primeiro login com senha provisória, o proxy só deixa acessar esta tela. */
export default function PaginaTrocarSenha() {
  return (
    <CartaoAuth titulo="Troque sua senha provisória" rodape={<BotaoSair />}>
      <p className="mb-4 text-sm text-texto-suave">
        Sua conta foi criada com uma senha provisória. Para continuar, crie uma senha só sua.
      </p>
      <FormularioNovaSenha textoBotao="Trocar senha e continuar" />
    </CartaoAuth>
  );
}
