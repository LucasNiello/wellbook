import { redirect } from 'next/navigation';
import { carregarPerfil } from '../../lib/perfil';
import { criarClienteServidor } from '../../lib/supabase/servidor';
import { PainelClinica, type DadosPainel } from '../../components/PainelClinica';

export default async function PaginaAdmin() {
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');
  const perfil = await carregarPerfil(supabase, user.id);
  if (!perfil?.tenantAdmin) redirect('/conta');
  const tenantId = perfil.tenantAdmin;
  const [clinica, servicos, profissionais, vinculos, horarios, bloqueios, agendamentos] = await Promise.all([
    supabase.from('tenants').select('id,nome,slug,logo_url,tema,whatsapp,endereco,prazo_cancelamento_min,ativo').eq('id', tenantId).single(),
    supabase.from('servicos').select('id,nome,duracao_min,preco,ativo').eq('tenant_id', tenantId).order('nome'),
    supabase.from('profissionais').select('id,usuario_id,especialidade,percentual_repasse,avatar_url,ativo').eq('tenant_id', tenantId).order('criado_em'),
    supabase.from('profissional_servicos').select('profissional_id,servico_id').eq('tenant_id', tenantId),
    supabase.from('horarios_atendimento').select('id,profissional_id,dia_semana,hora_inicio,hora_fim').eq('tenant_id', tenantId),
    supabase.from('bloqueios').select('id,profissional_id,inicio,fim,motivo').eq('tenant_id', tenantId).gte('fim', new Date().toISOString()).limit(30),
    supabase.from('agendamentos_admin').select('id,profissional_id,cliente_nome,cliente_telefone,inicio,fim,status').eq('tenant_id', tenantId).gte('inicio', new Date(Date.now() - 86400000).toISOString()).order('inicio').limit(100),
  ]);
  if (clinica.error || !clinica.data || servicos.error || profissionais.error || vinculos.error || horarios.error || bloqueios.error || agendamentos.error) {
    return <main className="p-8" role="alert">Não foi possível carregar os dados da clínica. Atualize a página e tente novamente.</main>;
  }
  const ids = (profissionais.data ?? []).map((p) => p.usuario_id);
  const nomes = ids.length ? await supabase.from('usuarios').select('id,nome').in('id', ids) : { data: [] };
  const mapaNomes = new Map((nomes.data ?? []).map((u) => [u.id, u.nome]));
  const agendamentoIds = (agendamentos.data ?? []).map((a) => a.id);
  const itens = agendamentoIds.length ? await supabase.from('agendamento_servicos').select('agendamento_id,servico_id').in('agendamento_id', agendamentoIds) : { data: [] };
  const nomesServicos = new Map((servicos.data ?? []).map((s) => [s.id, s.nome]));
  const dados: DadosPainel = {
    clinica: clinica.data,
    servicos: servicos.data ?? [],
    profissionais: (profissionais.data ?? []).map((p) => ({ ...p, nome: mapaNomes.get(p.usuario_id) ?? 'Profissional' })),
    vinculos: vinculos.data ?? [],
    horarios: horarios.data ?? [],
    bloqueios: bloqueios.data ?? [],
    agendamentos: (agendamentos.data ?? []).map((a) => ({ ...a, servicos: (itens.data ?? []).filter((item) => item.agendamento_id === a.id).map((item) => nomesServicos.get(item.servico_id) ?? 'Serviço') })),
    usuarioId: user.id,
  };
  return <PainelClinica dadosIniciais={dados} />;
}
