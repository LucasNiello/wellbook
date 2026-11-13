# Direção visual completa — Wellbook

Imagens de referência geradas em 13/11/2026. **São conceitos, não telas implementadas.** Fotos, nomes, datas, preços, quantidades e disponibilidade são ilustrativos. A interface final deve usar o Supabase e as regras reais. Algumas imagens de conceito contêm texto ou estado ilustrativo imperfeito; não os transcrever para o produto.

Base confirmada: `documentacao/Wellbook-Documento-de-Requisitos.pdf`, especialmente perfis e permissões (seções 2–4) e identidade visual (seção 8). A página do Notion compartilhada anteriormente retornou 404 na integração disponível; validar o planejamento atual antes de implementar conceitos de fases futuras.

## Telas e abas

| Arquivo | Rota/área | Situação no código |
|---|---|---|
| `09-inicio.png` | `/` | Rota existente; redesign proposto |
| `01-entrada-wellbook.png` | `/entrar` | Rota existente; redesign proposto |
| `10-cadastro.png` | `/cadastro` | Rota existente; redesign proposto |
| `11-recuperar-senha.png` | `/recuperar-senha` | Rota existente; redesign proposto |
| `12-redefinir-senha.png` | `/redefinir-senha` | Rota existente; redesign proposto |
| `13-trocar-senha.png` | `/trocar-senha` | Rota existente; redesign proposto |
| `14-minha-conta.png` | `/conta` | Rota existente; redesign proposto |
| `15-privacidade.png` | `/privacidade` | Rota existente; usar texto jurídico já aprovado, nunca o texto da imagem |
| `03-painel-clinica.png` | `/admin` · Visão geral | Aba existente |
| `05-admin-minha-clinica.png` | `/admin` · Minha clínica | Aba existente |
| `06-admin-profissionais.png` | `/admin` · Profissionais | Aba existente |
| `07-admin-servicos.png` | `/admin` · Serviços | Aba existente |
| `08-admin-agenda.png` | `/admin` · Agenda | Aba existente; somente leitura |
| `04-painel-plataforma.png` | `/super-admin` · Clínicas | Rota existente |
| `21-super-admin-criar-admin.png` | `/super-admin` · Novo admin | Modal existente |
| `16-profissional-agenda.png` | `/profissional` | Rota provisória; conceito para fase posterior |
| `02-vitrine-clinica-serena.png` | Perfil público da clínica | Conceito de fase posterior |
| `17-agendar-profissional.png` | Agendamento · Profissional | Conceito de fase posterior |
| `18-agendar-servicos.png` | Agendamento · Serviços | Conceito de fase posterior |
| `19-agendar-data-horario.png` | Agendamento · Data e horário | Conceito de fase posterior |
| `20-agendar-confirmar.png` | Agendamento · Confirmar | Conceito de fase posterior |
| `22-meus-agendamentos.png` | Agendamentos do cliente | Conceito de fase posterior |

`/auth/callback` e `/auth/confirmar` são endpoints de retorno da autenticação, sem tela persistente própria.

## Elementos separados para implementação

Todos estão em `apps/web/public/imagens/wellbook/` e podem ser acessados no Next.js por `/imagens/wellbook/<arquivo>`.

| Arquivo | Uso sugerido |
|---|---|
| `logo-claro.svg` | Marca sobre fundo escuro |
| `logo-escuro.svg` | Marca sobre fundo claro |
| `simbolo.svg` | Símbolo isolado; favicon/ícone quando adequado |
| `fundo-entrada.png` | Entrada, cadastro e senhas |
| `recepcao-clinica.png` | Vitrine e cabeçalhos da clínica |
| `fundo-privacidade.png` | Faixa editorial da política |
| `sala-atendimento.png` | Serviços e conteúdo visual da clínica |
| `retrato-profissional-01.png` | Demonstração de profissional fictício |
| `retrato-profissional-02.png` | Demonstração de profissional fictício |
| `retrato-profissional-03.png` | Demonstração de profissional fictício |

As fotos separadas foram geradas a partir das cenas dos mockups, como versões limpas. Não são recortes exatos dos pixels das composições. Retratos são **apenas para demonstração**; em uso real, mostrar o avatar enviado por cada profissional ou um fallback sem fotografia fictícia.

## Aplicação com Animata

- **Páginas públicas e autenticação:** revelação suave do hero, texto em sequência e borda animada no CTA principal.
- **Clínica e agendamento:** etapas com `AbasFluidas`, transição dos retratos e cartões, modal apenas quando a interação exigir.
- **Admin:** navegação fluida entre as cinco abas, borda animada só no destaque principal, elevação discreta dos cartões.
- **Super Admin:** `ModalAnimado` com foco correto e animação breve para criação de clínica/admin.

Respeitar `prefers-reduced-motion`, foco visível, contraste WCAG AA e os tokens dos oito temas. A identidade Wellbook usa preto `#0E0E10`, marfim `#F5F1EA`, champagne `#C9A96E`; o tema Sálvia exemplificado usa fundo `#FAF7F2` e destaque `#3F6B58`. O admin vê nome e telefone dos clientes, nunca e-mail/observações; o Super Admin não vê dados operacionais das clínicas.
