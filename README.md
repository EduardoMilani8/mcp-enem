# mcp-enem

[![Verificar](https://github.com/EduardoMilani8/mcp-enem/actions/workflows/verificar.yml/badge.svg)](https://github.com/EduardoMilani8/mcp-enem/actions/workflows/verificar.yml)

Servidor MCP para estudar para o ENEM com o Claude: questões reais da prova,
correção com gabarito oficial e acompanhamento do seu desempenho.

## O que ele faz

Com o servidor conectado, você conversa normalmente:

- "Me dá 5 questões de matemática do ENEM."
- "Minha resposta é a C." (o Claude corrige e explica)
- "Quero questões sobre logaritmo."
- "Me explica a questão 95 de 2023, sem contar como tentativa."
- "Como está meu desempenho em Química?"
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

O servidor só é carregado quando a conversa começa: depois de instalar, abra
uma conversa nova. Para remover do Claude Code, use `claude mcp remove mcp-enem`.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `listar_provas` | Anos, áreas e idiomas disponíveis |
| `buscar_questoes` | Sorteia questões por ano, área e palavras-chave, sem o gabarito |
| `obter_questao` | Uma questão específica, pelo ano e número |
| `corrigir_resposta` | Confere a resposta, revela o gabarito e grava no histórico, com a matéria e o assunto |
| `ver_gabarito` | Mostra a resposta certa sem gravar nada |
| `desfazer_ultima_tentativa` | Remove do histórico o último registro |
| `ver_desempenho` | Acertos e erros no geral, nos últimos 7 dias, por área, por matéria e por assunto |
| `revisar_erros` | Questões que você errou, para refazer |

## Roteiros prontos

O servidor também traz quatro roteiros de estudo. No Claude Code eles aparecem
como comandos ao digitar `/`; no Claude Desktop, no menu de anexos.

| Roteiro | O que faz |
|---|---|
| `simulado_rapido` | Simulado curto, com correção só no final |
| `revisao_dos_erros` | Refaz, uma por uma, as questões que você errou |
| `estudar_assunto` | Resumo de um assunto e questões sobre ele |
| `como_estou` | Diagnóstico do seu histórico e plano para a semana |

## Seus dados

Tudo fica na sua máquina, em `~/.mcp-enem/`:

- `cache/`: as provas e imagens já baixadas (cada ano é baixado uma vez só).
- `historico.jsonl`: suas respostas, uma por linha.

Para usar outra pasta, defina a variável de ambiente `MCP_ENEM_DIR`. Para
zerar o histórico, apague o arquivo `historico.jsonl`; para tirar só o último
registro, peça ao Claude para desfazer a última tentativa.

## Limitações

- Provas de 2009 a 2023 (é o que a fonte de dados tem hoje).
- A fonte de dados só separa as questões nas quatro grandes áreas. A matéria e
  o assunto são identificados pelo Claude na hora da correção, então só existem
  para as questões que você já respondeu.
- A busca por assunto procura palavras no texto da questão, não o tema: uma
  questão de logaritmo que não usa a palavra não é encontrada.
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

Os testes pedem o Node.js 22.12 ou superior; o servidor em si roda a partir do
Node 20. A arquitetura está em [docs/especificacao.md](docs/especificacao.md)
e as mudanças de cada versão em [CHANGELOG.md](CHANGELOG.md).

## Contribuir

Achou um problema, uma questão com erro, ou tem uma ideia? Abra uma
[issue](https://github.com/EduardoMilani8/mcp-enem/issues/new/choose): há um
formulário para cada caso. Para enviar código, veja o
[guia de contribuição](CONTRIBUTING.md).

## Créditos

- Questões: [INEP](https://www.gov.br/inep/), organizador do ENEM.
- Dados estruturados: [enem.dev](https://enem.dev)
  ([yunger7/enem-api](https://github.com/yunger7/enem-api)).

## Licença

[MIT](LICENSE)
