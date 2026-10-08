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
- Nenhuma ferramenta além de `corrigir_resposta` pode devolver o gabarito.
- Testes automáticos não usam a rede; usam a API falsa de `testes/apoio.ts`.
- O plano de implementação está em `docs/plano-de-implementacao.md`.
