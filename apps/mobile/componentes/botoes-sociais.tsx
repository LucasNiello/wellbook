import { Botao } from './ui';

// §7.1: login social só aparece, desabilitado e marcado "Em desenvolvimento".
export function BotoesSociais() {
  return (
    <>
      <Botao titulo="Entrar com Google" secundario desabilitado selo="Em desenvolvimento" />
      <Botao titulo="Entrar com Apple" secundario desabilitado selo="Em desenvolvimento" />
    </>
  );
}
