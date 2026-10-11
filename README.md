# mcp-enem

[![Versão no npm](https://img.shields.io/npm/v/mcp-enem)](https://www.npmjs.com/package/mcp-enem)
[![Verificação automática](https://github.com/EduardoMilani8/mcp-enem/actions/workflows/verificar.yml/badge.svg)](https://github.com/EduardoMilani8/mcp-enem/actions/workflows/verificar.yml)

Estude para o ENEM conversando com o Claude: ele traz questões reais da prova,
corrige com o gabarito oficial e acompanha o seu desempenho.

É gratuito, funciona sem cadastro e o seu histórico fica só no seu computador.

## Como é na prática

Depois de instalar, você conversa normalmente:

> **Você:** Me dá 3 questões de matemática do ENEM.
>
> **Claude:** *(mostra a primeira questão, sem a resposta)*
>
> **Você:** Letra C.
>
> **Claude:** Errou, o gabarito é a D. *(explica a resolução e mostra a próxima)*
>
> **Você:** Como estou indo?
>
> **Claude:** Você acertou 12 de 20. Seu ponto mais fraco é Química...

O mcp-enem é um servidor MCP: um programa pequeno que dá ao Claude acesso às
questões oficiais e ao seu histórico de respostas. Você não precisa entender
como ele funciona para usar.

## Instalação

### 1. Tenha o Node.js instalado

O mcp-enem precisa do Node.js na versão 20 ou mais nova. Para conferir, abra o
terminal e digite:

```bash
node --version
```

Se aparecer um número a partir de `v20`, está pronto. Se der erro ou o número
for menor, instale pelo site [nodejs.org](https://nodejs.org) (escolha a versão
"LTS").

### 2. Conecte ao Claude

Escolha o aplicativo que você usa.

**Claude Code** (no terminal): rode este comando uma vez.

```bash
claude mcp add mcp-enem -- npx -y mcp-enem@latest
```

**Claude Desktop** (o aplicativo de computador):

1. Abra **Configurações**, depois **Desenvolvedor**, depois **Editar configuração**.
2. No arquivo que abrir, coloque o trecho abaixo. Se o arquivo já tiver uma
   seção `mcpServers`, acrescente só a parte do `mcp-enem` dentro dela.

   ```json
   {
     "mcpServers": {
       "mcp-enem": {
         "command": "npx",
         "args": ["-y", "mcp-enem@latest"]
       }
     }
   }
   ```

3. Salve o arquivo e feche o Claude Desktop por completo. Abra de novo.

**Outro aplicativo compatível com MCP:** configure um servidor do tipo "stdio"
com o comando `npx` e os argumentos `-y mcp-enem@latest`.

### 3. Abra uma conversa nova

O servidor só é carregado quando a conversa começa. Abra uma conversa nova e
peça: "Me dá uma questão do ENEM."

Não é preciso baixar nada à mão. O `npx` busca o mcp-enem na primeira vez e,
com o `@latest`, pega a versão mais recente sempre que o Claude inicia.

## O que você pode pedir

Não há comandos para decorar. Alguns exemplos:

**Para praticar**

- "Me dá 5 questões de matemática do ENEM."
- "Quero questões de Ciências Humanas do ENEM 2022."
- "Me dá as questões de inglês do ENEM 2023."
- "Só questões sem imagem, por favor."

**Para estudar um assunto**

- "Quero questões sobre fotossíntese."
- "Tem questão sobre Era Vargas?"

**Para entender uma questão sem valer nota**

- "Me explica a questão 95 de 2023, sem contar como tentativa."

**Para acompanhar o seu progresso**

- "Como estou indo?"
- "Como está meu desempenho em Química?"
- "Quero refazer as questões que eu errei."

**Para corrigir um engano**

- "Desfaz a última tentativa, respondi sem querer."

### Roteiros prontos

O mcp-enem também traz quatro sessões de estudo já montadas. No Claude Code,
digite `/` e procure por `mcp-enem`; no Claude Desktop, elas ficam no botão de
anexar (`+`).

| Roteiro | O que acontece |
|---|---|
| `simulado_rapido` | Um simulado curto. O Claude só corrige no final e resume os seus erros |
| `revisao_dos_erros` | Você refaz, uma por uma, as questões que errou |
| `estudar_assunto` | Um resumo do assunto que você escolher e questões sobre ele |
| `como_estou` | Um diagnóstico do seu histórico e um plano de estudo para a semana |

## Perguntas frequentes

**É gratuito?**
Sim. O mcp-enem é gratuito e de código aberto. Você só precisa ter acesso ao
Claude.

**Precisa de internet?**
Só na primeira vez que você usa cada ano de prova. Nessa hora a prova inteira é
baixada, o que leva uns 5 segundos. Depois disso aquele ano funciona sem
internet.

**Onde ficam as minhas respostas?**
Só no seu computador, na pasta `.mcp-enem` dentro da sua pasta pessoal. Nada é
enviado para nenhum servidor nosso.

**As figuras das questões aparecem?**
O Claude recebe as figuras e consegue lê-las. No Claude Code, que roda no
terminal, você não vê a imagem: o Claude descreve o que há nela e mostra o
link para você abrir. Se preferir, peça "só questões sem imagem".

**Tem as provas mais recentes?**
Estão disponíveis as provas de 2009 a 2023. É o que a fonte de dados oferece
hoje.

**Tem redação?**
Ainda não.

**O Claude pode ver o gabarito antes de eu responder?**
Não. As questões são entregues a ele sem a resposta. O gabarito só é liberado
quando você responde ou quando pede explicitamente para ver.

**Pedi um assunto e vieram poucas questões. Por quê?**
A busca procura as palavras no texto da questão, não o tema. Uma questão de
logaritmo que não usa essa palavra não é encontrada. Tente pedir de novo ou
usar outro termo; a cada pedido o Claude procura em mais provas.

**Por que meu desempenho por matéria está incompleto?**
A fonte de dados só separa as questões em quatro grandes áreas. A matéria e o
assunto são identificados pelo Claude quando ele corrige, então só existem para
as questões que você já respondeu.

**Como apago o meu histórico?**
Apague o arquivo `historico.jsonl` na pasta `.mcp-enem`. Para tirar só a última
resposta, peça ao Claude: "desfaz a última tentativa".

**Como removo o mcp-enem?**
No Claude Code, rode `claude mcp remove mcp-enem`. No Claude Desktop, apague o
trecho do `mcp-enem` do arquivo de configuração e reinicie o aplicativo.

## Não funcionou?

- **O Claude responde sem buscar questões de verdade.** Abra uma conversa nova:
  o servidor só carrega no começo da conversa. No Claude Code, o comando
  `claude mcp list` mostra se o `mcp-enem` está conectado.
- **Erro ao iniciar o servidor.** Confira a versão com `node --version`. Precisa
  ser a 20 ou mais nova.
- **"Não consegui falar com a API do ENEM".** A fonte das questões está fora do
  ar ou você está sem internet. As provas que você já usou continuam
  funcionando; a mensagem diz quais são.
- **Continua com problema?** [Abra uma issue](https://github.com/EduardoMilani8/mcp-enem/issues/new/choose)
  pelo formulário "Relatar um problema".

## Para quem quer os detalhes

### Ferramentas

É por meio destas ferramentas que o Claude trabalha. Você não as chama
diretamente.

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

### Onde os dados ficam

Tudo fica em `~/.mcp-enem/`:

- `cache/`: as provas e imagens já baixadas (cada ano é baixado uma vez só).
- `historico.jsonl`: suas respostas, uma por linha.

Para usar outra pasta, defina a variável de ambiente `MCP_ENEM_DIR`.

### Limitações

- Provas de 2009 a 2023, sem redação.
- Questões anuladas e questões com imagem quebrada na fonte não aparecem.
- A matéria e o assunto só existem para as questões já respondidas.
- A busca por assunto é por palavra no texto, não por tema.

### Desenvolvimento

```bash
git clone https://github.com/EduardoMilani8/mcp-enem.git
cd mcp-enem
npm install
npm run verificar
npm run build
```

Os testes pedem o Node.js 22.12 ou mais novo; o servidor em si roda a partir do
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
