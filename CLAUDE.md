# mcp-enem

Servidor MCP em TypeScript para estudar para o ENEM. Especificação em
`docs/especificacao.md`.

## Convenções

- Tudo em português: README, documentação, mensagens de commit, nomes e
  descrições das ferramentas MCP, mensagens de erro e comentários.
- Nomes de domínio no código também em português (`questao`, `gabarito`,
  `historico`).
- Nunca escrever no stdout: é o canal do protocolo MCP. Logs vão para o stderr.
- Nenhuma ferramenta além de `corrigir_resposta` pode devolver o gabarito.
- Testes automáticos não usam a rede; usam as respostas gravadas em
  `testes/fixtures/`.
