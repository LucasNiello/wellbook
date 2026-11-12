import type { NextConfig } from 'next';

const configuracao: NextConfig = {
  // O pacote compartilhado é publicado como fonte TypeScript (ver F1-05 no log de decisões).
  transpilePackages: ['@wellbook/shared'],
};

export default configuracao;
