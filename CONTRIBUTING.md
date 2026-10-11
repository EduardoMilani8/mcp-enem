# Como contribuir

Obrigado pelo interesse em melhorar o mcp-enem. Este guia explica como
funcionam as issues e os pull requests do projeto.

## Issues

Toda issue é aberta por um dos três formulários. Issues em branco estão
desativadas, para que cada relato já chegue com o que é preciso para agir.

| Formulário | Use quando | Etiqueta |
|---|---|---|
| Relatar um problema | O servidor deu erro, travou ou respondeu algo estranho | `bug` |
| Questão com erro | O conteúdo de uma questão está errado (gabarito, imagem, texto) | `dados` |
| Sugerir uma melhoria | Você quer uma funcionalidade nova ou uma mudança de comportamento | `melhoria` |

Algumas coisas que ajudam:

- **Uma issue por assunto.** Dois problemas diferentes são duas issues.
- **Procure antes.** Se já existe uma issue igual, acrescente um comentário
  nela com o seu caso.
- **Conteúdo das questões vem de fora.** As questões são do projeto
  [enem.dev](https://enem.dev). Um erro de conteúdo é registrado aqui para
  conferência e, se for da fonte, encaminhado para lá.
- **Sugestões partem do problema.** O formulário pergunta se o Claude já
  consegue fazer aquilo sozinho. O servidor só vale a pena onde ele não
  alcança: dados que ele não tem e ações que ele não pode fazer.

O que acontece depois: a issue é lida, recebe uma etiqueta e uma resposta
dizendo se será feita, se precisa de mais informação ou se fica fora do escopo
(e por quê). O projeto é mantido por uma pessoa no tempo livre, então a
resposta pode levar alguns dias.

## Pull requests

### Antes de começar

- **Correção pequena** (erro de digitação, mensagem confusa, bug evidente):
  pode abrir o pull request direto.
- **Funcionalidade nova ou mudança de comportamento:** abra primeiro uma issue
  de sugestão e espere a resposta. Assim ninguém perde tempo com algo que não
  vai entrar.

A seção "Fora do escopo" da [especificação](docs/especificacao.md) lista o que
está planejado para depois e o que foi recusado de propósito.

### Passo a passo

1. Faça um fork do repositório e clone o seu fork.
2. Crie uma branch a partir da `main` com um nome que diga o que ela faz
   (por exemplo `corrige-busca-por-acento`).
3. Instale e confira que tudo passa antes de mexer:

   ```bash
   npm install
   npm run verificar
   ```

4. Escreva primeiro o teste que mostra o problema ou o comportamento novo, veja
   que ele falha, e só então escreva o código.
5. Rode `npm run verificar` de novo.
6. Abra o pull request para a `main` e preencha o modelo.

Para rodar os testes é preciso o Node.js 22.12 ou superior (exigência do
executor de testes). O servidor em si funciona a partir do Node 20.

### Regras do projeto

- **Tudo em português:** nomes e descrições das ferramentas, mensagens de erro,
  comentários, nomes de domínio no código (`questao`, `gabarito`, `historico`)
  e mensagens de commit.
- **Commits pequenos, um assunto por commit.** Um módulo com seus testes, uma
  correção, um ajuste de documentação. A mensagem diz o que muda e, quando não
  for óbvio, por quê.
- **Teste antes do código.** Toda mudança de comportamento vem com um teste que
  falhava antes dela.
- **Testes sem rede.** Use a API falsa de `testes/apoio.ts`, que imita o
  comportamento da enem.dev com questões inventadas.
- **Nada no stdout.** O stdout é o canal do protocolo MCP; qualquer texto ali
  quebra a conversa. Logs usam `log()`, que escreve no stderr.
- **O gabarito só sai por `corrigir_resposta` e `ver_gabarito`.** As
  ferramentas que entregam questões nunca o incluem.
- **Sem dados da enem.dev no repositório.** O projeto consome a API; não
  redistribui o conteúdo dela.
- **Sem dependências novas** além do SDK do MCP e do `zod`, a não ser que a
  issue tenha combinado isso antes.

### Revisão

Todo pull request roda a verificação automática (tipos, testes e build). Depois
disso ele é revisado por uma pessoa. É comum pedir ajustes; isso faz parte do
processo e não é crítica a quem contribuiu. Um pull request é aceito quando:

- a verificação automática passa;
- a mudança está coberta por teste;
- segue as regras acima;
- o README e a especificação refletem o que mudou.

Ao enviar um pull request, você concorda que a sua contribuição seja
distribuída sob a [licença MIT](LICENSE) do projeto.

## Convivência

Seja gentil e direto. Críticas são ao código e às ideias, nunca às pessoas.
Comentários ofensivos ou desrespeitosos são removidos.
