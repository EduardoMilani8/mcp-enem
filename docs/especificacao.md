# Especificação: mcp-enem (versão 1)

Data: 08/10/2026 · Situação: implementada (versão 0.1.0)

## Objetivo

Um servidor MCP que permite estudar para o ENEM conversando com o Claude (ou
outro cliente MCP): receber questões reais da prova, responder, ser corrigido e
acompanhar o próprio desempenho ao longo do tempo.

**Para quem:** estudantes que já usam IA para estudar. Na versão 1, quem
consegue instalar um servidor MCP local; o conector remoto fica para depois.

**O que conta como sucesso na versão 1:**

- Pedir "me dá 5 questões de matemática" e receber questões oficiais.
- Responder e receber a correção com o gabarito oficial.
- Perguntar "como estou indo?" e ver acertos e erros por área.
- Instalar com um único comando (`npx`).

## Fonte de dados

API pública [enem.dev](https://enem.dev) (`https://api.enem.dev/v1`), projeto
open source [yunger7/enem-api](https://github.com/yunger7/enem-api), GPL-2.0.

Fatos verificados em 08/10/2026:

| Fato | Valor |
|---|---|
| Provas disponíveis | 2009 a 2023 |
| Questões por ano | cerca de 180, mais as 5 de língua estrangeira em cada idioma |
| Áreas | `linguagens`, `ciencias-humanas`, `ciencias-natureza`, `matematica` |
| Idiomas de língua estrangeira | `ingles`, `espanhol` (2009 não tem; 2011 só espanhol) |
| Limite de requisições | 10 a cada 10 segundos |
| Máximo por página | 50 questões (`limit` maior devolve erro 400) |
| Questões com imagem | cerca de 40% (campo `files` e/ou imagem em alternativa) |
| Autenticação | nenhuma |

Limitações conhecidas da fonte:

- Não há classificação por matéria ou assunto, só as 4 áreas.
- Algumas imagens estão quebradas na origem (`broken-image.svg`) e algumas
  alternativas vêm vazias.
- Questões anuladas não existem na API (2023 não tem a 34 nem a 174).
- O `offset` da paginação é o número da questão, e as páginas se sobrepõem.
- Sem o parâmetro `language`, as questões de língua estrangeira vêm só em
  espanhol; o inglês exige outra chamada. A posição delas muda conforme o ano
  (1 a 5 em 2023, 91 a 95 em 2015).
- `metadata.total` não é confiável e o filtro `discipline` é ignorado.
- É mantida por uma pessoa; pode ficar fora do ar.

O detalhamento está em [plano-de-implementacao.md](plano-de-implementacao.md).

## Arquitetura

```
Cliente MCP (Claude) ──stdio──▶ servidor.ts
                                   │
                                   ▼
                              ferramentas/   (o que o modelo enxerga)
                               │        │
                               ▼        ▼
                          enem/        historico/
                     (API + cache)   (tentativas do aluno)
                               │        │
                               ▼        ▼
                         ~/.mcp-enem/cache   ~/.mcp-enem/historico.jsonl
```

Três módulos, cada um com um papel:

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `enem/` | Buscar provas e questões na API, respeitar o limite, guardar em cache | rede, disco |
| `historico/` | Gravar e ler as tentativas do aluno, calcular estatísticas | disco |
| `ferramentas/` | Definir as ferramentas MCP, validar parâmetros, montar as respostas | `enem/`, `historico/` |

`servidor.ts` só liga as peças e inicia o transporte stdio.

### Tecnologias

- TypeScript em Node.js 20 ou superior.
- SDK oficial `@modelcontextprotocol/sdk`, transporte stdio.
- `zod` para validar os parâmetros das ferramentas.
- `vitest` para testes.
- Sem banco de dados: arquivos JSON no disco.

### Onde os dados ficam

Diretório `~/.mcp-enem/` (pode ser trocado pela variável `MCP_ENEM_DIR`):

- `cache/provas.json`: lista de provas.
- `cache/2023.json`, `cache/2022.json`, ...: todas as questões de um ano.
- `cache/imagens/`: imagens já baixadas.
- `historico.jsonl`: uma linha por tentativa de resposta.

## Ferramentas

Nomes, descrições e mensagens em português.

### `listar_provas`

Sem parâmetros. Devolve os anos disponíveis, as áreas e os idiomas.

### `buscar_questoes`

Sorteia questões para o aluno responder.

| Parâmetro | Tipo | Padrão | Observação |
|---|---|---|---|
| `quantidade` | inteiro 1 a 20 | 5 | |
| `area` | uma das 4 áreas | qualquer | |
| `ano` | 2009 a 2023 | sorteado | |
| `idioma` | `ingles` ou `espanhol` | `ingles` | só afeta as questões 1 a 5 |
| `apenas_texto` | booleano | `false` | se `true`, pula questões com imagem |
| `ineditas` | booleano | `true` | evita questões que o aluno já respondeu |

Devolve cada questão com ano, número, área, enunciado, alternativas e imagens.
**Nunca devolve o gabarito.**

### `obter_questao`

Parâmetros: `ano`, `numero`, `idioma` (opcional). Devolve uma questão
específica, também sem gabarito.

### `corrigir_resposta`

Parâmetros: `ano`, `numero`, `resposta` (letra de A a E), `idioma` (opcional).

Devolve se o aluno acertou, a alternativa correta e o texto dela. Grava a
tentativa no histórico. É a única ferramenta que revela o gabarito.

### `ver_desempenho`

Parâmetros opcionais: `area`, `dias` (janela de tempo, padrão: tudo).

Devolve total de tentativas, acertos, percentual geral e por área, e a evolução
recente.

### `revisar_erros`

Parâmetros opcionais: `quantidade` (padrão 5), `area`.

Devolve questões que o aluno errou e ainda não acertou depois, sem gabarito,
para refazer.

## Fluxo de dados

**Buscar questões**

1. A ferramenta valida os parâmetros.
2. Se o ano não foi informado, sorteia um, dando preferência aos que já estão
   em cache.
3. `enem/` lê `cache/<ano>.json`. Se não existir, baixa o ano inteiro (4 páginas
   de 50, mais uma chamada para o segundo idioma), remove duplicatas por
   (ano, número, idioma) e grava.
4. A ferramenta filtra por área, idioma, imagem e ineditismo, sorteia e remove
   o gabarito antes de responder.
5. As imagens das questões escolhidas são baixadas, guardadas em cache e
   anexadas à resposta; o link original também vai no texto.

**Corrigir resposta**

1. Carrega a questão (do cache, normalmente).
2. Compara a resposta com `correctAlternative`.
3. Acrescenta uma linha em `historico.jsonl`:
   `{ "quando", "ano", "numero", "idioma", "area", "resposta", "correta", "acertou" }`.
4. Responde com o resultado e o gabarito.

## Erros previstos e tratamento

| Situação | Tratamento |
|---|---|
| Limite de 10 req/10s | Fila que espaça as requisições; cache em disco faz cada ano ser baixado uma única vez |
| Resposta 429 mesmo assim | Espera o tempo de `x-ratelimit-reset` e tenta de novo, no máximo 3 vezes |
| API fora do ar ou lenta | Tempo limite de 15 s; usa o cache se houver; senão, mensagem clara sugerindo tentar um ano já baixado |
| Ano ou questão inexistente | Mensagem dizendo quais anos e números são válidos |
| Parâmetro inválido | `zod` rejeita com mensagem em português |
| Gabarito vazando | Tipo separado para "questão pública" sem o campo de gabarito; só `corrigir_resposta` acessa a versão completa |
| Imagem quebrada ou alternativa vazia na origem | Questão marcada como `incompleta` e pulada no sorteio |
| Muitas imagens numa resposta | No máximo 8 anexadas; as demais vão só como link |
| Prova sem o idioma pedido | As questões de língua estrangeira ficam de fora; nenhuma chamada inválida à API |
| Falha ao baixar imagem | Questão vai só com o link e um aviso |
| Questões 1 a 5 em dobro | Filtro por `idioma`; a chave da questão inclui o idioma |
| Texto escrito no stdout | Proibido: o stdout é o canal do protocolo. Todo log vai para o stderr |
| Queda no meio de uma gravação | Cache gravado em arquivo temporário e renomeado; histórico só acrescenta linhas |
| Linha corrompida no histórico | Linha ignorada com aviso no stderr; as demais continuam valendo |
| Cache corrompido | Arquivo descartado e baixado de novo |

## Testes

- **Unitários** para `enem/` (paginação, duplicatas, cache, limite) e
  `historico/` (gravação, estatísticas, linhas corrompidas), com a rede
  simulada por uma API falsa em `testes/apoio.ts`, que imita o comportamento
  da real com questões inventadas (assim o repositório não redistribui dados
  da enem.dev).
- **Das ferramentas**: cada uma chamada de ponta a ponta com um diretório
  temporário, incluindo um teste que garante que nenhuma resposta de
  `buscar_questoes`, `obter_questao` ou `revisar_erros` contém o gabarito.
- **Manual**: conectar no Claude e fazer uma sessão de estudo real.

A rede de verdade não é usada nos testes automáticos.

## Distribuição

Pacote npm `mcp-enem`, executado com `npx -y mcp-enem`. O README traz a
configuração para o Claude Desktop e o Claude Code.

## Licença e créditos

Este projeto usa licença MIT. Ele consome a API enem.dev por HTTP e não
redistribui o código nem os dados dela; o cache fica só na máquina do usuário.
O README dá crédito ao projeto enem.dev. As questões são do INEP.

## Fora do escopo da versão 1

- Conector remoto (HTTP) com histórico por usuário.
- Classificação por matéria ou assunto.
- Redação.
- Provas de 2024 em diante (a API ainda não tem).
- Simulado cronometrado e nota pelo método TRI.

## Pontos em aberto

1. **Exibição de imagens**: verificado em 08/10/2026, numa sessão real contra
   a API, que o servidor anexa as imagens (PNG e JPEG) e manda o link no texto.
   Falta confirmar, usando o Claude de verdade, se o aluno vê a imagem na
   conversa. Se não vir, o padrão de `apenas_texto` muda para `true`.
2. **Nome no npm**: `mcp-enem` estava livre em 08/10/2026; confirmar de novo
   antes de publicar.
3. **Idioma do código**: nomes de domínio em português (`questao`, `gabarito`,
   `historico`), seguindo a decisão de manter o projeto em português.
