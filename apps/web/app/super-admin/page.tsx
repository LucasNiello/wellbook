import { redirect } from 'next/navigation';
import { carregarPerfil } from '../../lib/perfil';
import { criarClienteServidor } from '../../lib/supabase/servidor';
import { PainelPlataforma } from '../../components/PainelPlataforma';

export default async function PaginaSuperAdmin() {
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');
  const perfil = await carregarPerfil(supabase, user.id);
  if (!perfil?.papeis.includes('super_admin')) redirect('/conta');
  const { data, error } = await supabase.from('tenants').select('id,nome,slug,tema,ativo,criado_em').order('criado_em', { ascending: false });
  if (error) return <main className="p-8" role="alert">Não foi possível carregar as clínicas.</main>;
  return <PainelPlataforma clinicasIniciais={data ?? []}/>;
}
