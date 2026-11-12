import { AreaProvisoria } from '../../components/AreaProvisoria';

/** Protegida pelo proxy: só o Super Admin. */
export default function PaginaSuperAdmin() {
  return <AreaProvisoria titulo="Clínicas (Super Admin)" fase="Fase 4" />;
}
