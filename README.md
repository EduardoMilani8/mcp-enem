# mcp-enem

Servidor MCP para estudar para o ENEM com o Claude: questões reais da prova,
correção com gabarito oficial e acompanhamento do seu desempenho.

## O que ele faz

Com o servidor conectado, você conversa normalmente:

- "Me dá 5 questões de matemática do ENEM."
- "Minha resposta é a C." (o Claude corrige e explica)
- "Como está meu desempenho em Ciências da Natureza?"
- "Quero refazer as questões que eu errei."

## Instalação

Precisa do [Node.js](https://nodejs.org) 20 ou superior. O pacote ainda não
está no npm, então por enquanto a instalação é a partir do código:

```bash
git clone https://github.com/EduardoMilani8/mcp-enem.git
cd mcp-enem
npm install
npm run build
```

Depois conecte o servidor, trocando `/caminho/para` pela pasta onde você
clonou o projeto.

**Claude Code**

```bash
claude mcp add mcp-enem -- node /caminho/para/mcp-enem/dist/servidor.js
```

**Claude Desktop**

Em Configurações → Desenvolvedor → Editar configuração, acrescente:

```json
{
  "mcpServers": {
    "mcp-enem": {
      "command": "node",
      "args": ["/caminho/para/mcp-enem/dist/servidor.js"]
    }
  }
}
```

Reinicie o Claude Desktop.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `listar_provas` | Anos, áreas e idiomas disponíveis |
| `buscar_questoes` | Sorteia questões por ano e área, sem o gabarito |
| `obter_questao` | Uma questão específica, pelo ano e número |
| `corrigir_resposta` | Confere a resposta, revela o gabarito e grava no histórico |
| `ver_desempenho` | Acertos e erros no geral, nos últimos 7 dias e por área |
| `revisar_erros` | Questões que você errou, para refazer |

## Seus dados

Tudo fica na sua máquina, em `~/.mcp-enem/`:

- `cache/`: as provas e imagens já baixadas (cada ano é baixado uma vez só).
- `historico.jsonl`: suas respostas, uma por linha.

Para usar outra pasta, defina a variável de ambiente `MCP_ENEM_DIR`. Para
zerar o histórico, apague o arquivo `historico.jsonl`.

## Limitações

- Provas de 2009 a 2023 (é o que a fonte de dados tem hoje).
- O desempenho é por área do conhecimento, não por matéria.
- Questões anuladas e questões com imagem quebrada na fonte não aparecem.
- A primeira vez que você usa um ano de prova leva uns 5 segundos, porque a
  prova inteira é baixada; depois disso é instantâneo e funciona sem internet.
- Não cobre a redação.

## Desenvolvimento

```bash
npm install
npm run verificar
npm run build
```

A arquitetura está em [docs/especificacao.md](docs/especificacao.md).

## Créditos

- Questões: [INEP](https://www.gov.br/inep/), organizador do ENEM.
- Dados estruturados: [enem.dev](https://enem.dev)
  ([yunger7/enem-api](https://github.com/yunger7/enem-api)).

## Licença

[MIT](LICENSE)
