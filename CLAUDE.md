# mcp-enem

Servidor MCP em TypeScript para estudar para o ENEM. Especificação em
`docs/especificacao.md`.

## Convenções

- Tudo em português: README, documentação, mensagens de commit, nomes e
  descrições das ferramentas MCP, mensagens de erro e comentários.
- Commits pequenos e separados, um por mudança lógica (um módulo com seus
  testes, uma correção, um ajuste de documentação). Nunca juntar assuntos
  diferentes no mesmo commit.
- Trabalhar direto na branch `main`: commit e push nela, sem branches de
  funcionalidade.
- Nomes de domínio no código também em português (`questao`, `gabarito`,
  `historico`).
- Nunca escrever no stdout: é o canal do protocolo MCP. Logs vão para o stderr.
- Só `corrigir_resposta` e `ver_gabarito` podem devolver o gabarito. As
  ferramentas que entregam questões nunca o incluem.
- Os roteiros (prompts do MCP) ficam em `src/roteiros/` e só podem citar
  ferramentas que existem; há um teste que confere isso.
- Testes automáticos não usam a rede; usam a API falsa de `testes/apoio.ts`.
- `docs/plano-de-implementacao.md` é um registro histórico; a referência atual
  é a especificação.
- Mudança visível para quem usa entra no `CHANGELOG.md`.
- Contribuições de fora chegam por pull request (ver `CONTRIBUTING.md`); o
  mantenedor trabalha direto na `main`.
