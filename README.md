# mcp-enem

Servidor MCP para estudar para o ENEM com o Claude: questões reais da prova,
correção com gabarito oficial e acompanhamento do seu desempenho.

> **Situação:** em desenvolvimento. Ainda não há versão utilizável.

## O que vai fazer

Com o servidor conectado, você conversa normalmente:

- "Me dá 5 questões de matemática do ENEM."
- "Minha resposta é a C." (o Claude corrige e explica)
- "Como está meu desempenho em Ciências da Natureza?"
- "Quero refazer as questões que eu errei."

## Como funciona

MCP (Model Context Protocol) é o padrão que permite a um assistente de IA usar
ferramentas externas. Este servidor oferece ao Claude ferramentas para buscar
questões, corrigir respostas e consultar o seu histórico.

- As questões vêm da API pública [enem.dev](https://enem.dev), com provas de
  2009 a 2023.
- O servidor roda na sua máquina. Seu histórico de respostas fica só nela.
- O gabarito só é revelado depois que você responde.

Detalhes em [docs/especificacao.md](docs/especificacao.md).

## Créditos

- Questões: [INEP](https://www.gov.br/inep/), organizador do ENEM.
- Dados estruturados: [enem.dev](https://enem.dev)
  ([yunger7/enem-api](https://github.com/yunger7/enem-api)).

## Licença

[MIT](LICENSE)
