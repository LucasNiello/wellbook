import type { Papel } from '@wellbook/shared';
import { Botao, Atalho, Tela, Texto, Titulo } from '../componentes/ui';
import { useSessao } from '../contexto/sessao';

const ROTULO_PAPEL: Record<Papel, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador da clínica',
  profissional: 'Profissional',
  cliente: 'Cliente',
};

export default function Conta() {
  const { perfil, papeis, sair } = useSessao();

  return (
    <Tela>
      <Titulo>Minha conta</Titulo>
      <Texto>Nome: {perfil?.nome ?? '—'}</Texto>
      <Texto>E-mail: {perfil?.email ?? '—'}</Texto>
      <Texto>Telefone: {perfil?.telefone ?? '—'}</Texto>
      <Texto>Papéis: {papeis.papeis.map((p) => ROTULO_PAPEL[p]).join(', ')}</Texto>
      <Atalho href="/trocar-senha">Trocar senha</Atalho>
      <Atalho href="/privacidade">Política de privacidade</Atalho>
      <Botao titulo="Excluir minha conta (Em breve)" secundario desabilitado />
      <Botao titulo="Sair" aoPressionar={() => void sair()} />
    </Tela>
  );
}
