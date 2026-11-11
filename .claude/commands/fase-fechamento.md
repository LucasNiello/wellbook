---
description: Fecha uma fase do Wellbook. Aciona o reviewer e o test-runner e monta o relatório de fim de fase no formato do CLAUDE.md.
---

Fase a fechar: $ARGUMENTS

Passos:
1. Acione o subagente `test-runner` com pnpm typecheck, pnpm lint e pnpm test. Se algo falhar, corrija e repita antes de seguir.
2. Acione o subagente `reviewer` sobre o que esta fase entregou, indicando os RF/RN da fase e os arquivos alterados. Não pule este passo mesmo com os testes verdes: teste verde não prova requisito cumprido.
3. Corrija todo achado bloqueador ou importante e acione o reviewer de novo só sobre os pontos corrigidos. Achado cosmético vai para pendências.
4. Monte o relatório de fim de fase exatamente no formato do CLAUDE.md, com a tabela de subagentes usados.
5. Não edite o CLAUDE.md por conta própria: entregue no relatório o texto sugerido para atualizar a seção 7, se surgiu decisão nova.
6. Não rode nenhum comando git de escrita. Termine com a sugestão de commit como texto.
