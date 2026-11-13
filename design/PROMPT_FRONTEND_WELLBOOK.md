# Prompt de implementação visual — Wellbook

Implemente o site Wellbook em etapas pequenas e verificáveis, usando `design/telas/README.md` como mapa das referências e `apps/web/public/imagens/wellbook/` como fonte de assets. A fonte de verdade de conteúdo, permissões e funcionalidades é `documentacao/Wellbook-Documento-de-Requisitos.pdf`, seguida das decisões posteriores em `CLAUDE.md`. Imagens de mockup são direção de composição; seus nomes, preços, datas, contagens, textos jurídicos e disponibilidades são fictícios.

## Direção

- Marca: preto, marfim e champagne; clínicas usam um dos oito temas de `@wellbook/shared`, sem cores soltas nos componentes. Cormorant Garamond nos títulos e Inter na interface.
- Reproduza a hierarquia editorial das referências: hero fotográfico, títulos grandes, espaços generosos, linhas finas e poucos destaques por tela. Adapte para celular sem perder legibilidade.
- Use as fotos separadas com `next/image` e dimensões adequadas. Use as logos SVG. Preserve descrição alternativa útil; fotos puramente decorativas têm `alt=""`.
- Adapte componentes do Animata com propósito: `BordaAnimada` em um destaque por seção, `AbasFluidas` na navegação pertinente, `ModalAnimado` nos formulários existentes e revelação suave de conteúdo/imagem ao entrar no viewport. Não anime dados sensíveis nem atrase ações essenciais.
- Todo movimento respeita `prefers-reduced-motion`; foco visível, navegação por teclado e contraste WCAG AA são obrigatórios.

## Ordem de execução

1. Página inicial e autenticação (`/`, `/entrar`, `/cadastro`, recuperação e troca de senha): criar linguagem base e preservar os fluxos Supabase existentes.
2. Conta e privacidade: usar dados reais, manter texto jurídico do código e estados de erro/vazio.
3. Cinco abas do admin e Super Admin: aplicar a linguagem sem alterar RLS, regras de negócio ou permissões; agenda do admin é somente leitura.
4. Perfil público da clínica, agendamento e área do profissional apenas nas fases em que os respectivos fluxos funcionais forem implementados.

## Critérios de conclusão de cada etapa

- A página é utilizável em desktop e mobile, sem rolagem horizontal nem texto sobre foto de baixo contraste.
- Nenhum CTA aponta para função ou rota inexistente; não inserir dados fictícios como se fossem reais.
- Tipagem, lint e build web passam. Verificar visualmente a rota alterada e a interação principal.
- Registrar apenas riscos concretos; não modificar migrations ou contas do Supabase por trabalho visual.
