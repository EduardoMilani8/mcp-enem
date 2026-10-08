# Plano de implementação: mcp-enem (versão 1)

> **Para quem for executar (pessoa ou agente):** SUB-SKILL OBRIGATÓRIA: use
> superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para implementar este plano tarefa por tarefa. Os
> passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** um servidor MCP local que entrega questões reais do ENEM, corrige
respostas com o gabarito oficial e acompanha o desempenho do aluno.

**Arquitetura:** três módulos independentes. `enem/` busca as provas na API
enem.dev e guarda em cache no disco; `historico/` grava as tentativas do aluno e
calcula estatísticas; `ferramentas/` expõe tudo como seis ferramentas MCP. O
arquivo `servidor.ts` só liga as peças ao transporte stdio.

**Tecnologias:** TypeScript 7, Node.js 20+, `@modelcontextprotocol/sdk` 1.32,
`zod` 4, `vitest` 5.

**Especificação:** [docs/especificacao.md](especificacao.md). Leia antes de
começar; este plano parte dela.

## Restrições globais

- Tudo em português: nomes e descrições das ferramentas, mensagens de erro,
  comentários, nomes de domínio no código, commits.
- Nunca escrever no stdout (`console.log` é proibido). Logs só com `log()`, que
  usa o stderr.
- Só `corrigir_resposta` pode devolver o gabarito.
- Testes automáticos não usam a rede. A API é simulada por `testes/apoio.ts`.
- Node.js 20 ou superior. Módulos ES (`"type": "module"`); imports relativos
  terminam em `.js`.
- Dados do usuário em `~/.mcp-enem/` ou no caminho de `MCP_ENEM_DIR`.
- Sem banco de dados e sem dependências além do SDK e do `zod`.
- Não usar "parameter properties" do TypeScript (`constructor(private x)`);
  declare o campo e atribua no construtor.

## Comportamento real da API (verificado em 08/10/2026)

Quem implementar `enem/api.ts` precisa saber disto; a documentação da API não
conta tudo.

- `GET /exams` devolve as provas, cada uma com `languages` (2009 não tem
  nenhuma; 2011 só tem `espanhol`).
- `GET /exams/{ano}/questions?limit=50&offset=N`: `offset` é o **número da
  questão**, não a posição. A página traz as questões de `N` a `N + limit`
  (as páginas se sobrepõem em uma questão). `limit` acima de 50 dá erro 400.
- Sem o parâmetro `language`, as questões de língua estrangeira vêm só em
  espanhol. Para o inglês é preciso outra chamada com `language=ingles`.
- Pedir um `language` que a prova não tem dá erro 400.
- Em 2023 as questões de língua estrangeira são as de 1 a 5; em 2015 são as de
  91 a 95. Não assuma a posição.
- Questões anuladas simplesmente não existem (2023 não tem a 34 nem a 174).
- `metadata.total` não é confiável. `metadata.hasMore` pode vir `true` na
  última página. O parâmetro `discipline` é ignorado.
- Algumas alternativas vêm sem texto e sem imagem; algumas imagens apontam para
  `broken-image.svg`.
- Limite: 10 requisições a cada 10 segundos; o cabeçalho `x-ratelimit-reset`
  vem em milissegundos.

## Foco de revisão

Situações que a especificação implica e que mais provavelmente atingem um aluno
de verdade. Cada uma tem um teste na tarefa indicada.

1. **Resposta em minúscula** ("c" em vez de "C"): deve ser aceita e gravada em
   maiúscula. Tarefa 8.
2. **Pedir mais questões do que existem** com os filtros (ou já ter respondido
   todas): devolve as que houver com um aviso, nunca um erro. Tarefa 8.
3. **Sem internet com provas já baixadas**: o sorteio sem ano usa uma prova do
   cache em vez de falhar. Tarefa 8.
4. **Muitas imagens numa resposta só** (20 questões de matemática): no máximo 8
   imagens anexadas; as demais ficam como link. Tarefa 8.
5. **Prova sem inglês** (2011) ou sem língua estrangeira (2009) com o idioma
   padrão `ingles`: nenhuma chamada inválida à API e nenhum erro. Tarefas 3 e 5.

## Estrutura de arquivos

```
package.json
tsconfig.json              verificação de tipos (src + testes, sem gerar arquivos)
tsconfig.build.json        gera dist/ a partir de src/
src/
  servidor.ts              ponto de entrada (bin); liga tudo ao stdio
  criar-servidor.ts        monta o McpServer a partir das dependências
  versao.ts                número da versão
  config.ts                onde ficam os dados do usuário
  log.ts                   log no stderr
  disco.ts                 ler e gravar JSON com segurança
  enem/
    tipos.ts               Questao, QuestaoPublica, Prova, ErroEnem
    converter.ts           formato da API → formato interno
    api.ts                 ClienteApi: HTTP, limite, paginação
    repositorio.ts         RepositorioEnem: cache em disco e consultas
    imagens.ts             CarregadorDeImagens: baixa e guarda imagens
  historico/
    historico.ts           Historico: grava e lê tentativas
    estatisticas.ts        desempenho e erros pendentes
  ferramentas/
    sorteio.ts             filtrar, sortear, escolher o ano
    formatar.ts            questão e desempenho → texto
    registrar.ts           as seis ferramentas MCP
testes/
  apoio.ts                 API falsa e utilitários
  *.test.ts                um arquivo por módulo
```

## Partes escritas pelo Eduardo

Duas funções pequenas ficam para o Eduardo escrever, porque envolvem uma
decisão de comportamento e não só digitação:

- `escolherAno` (tarefa 5): como equilibrar provas já baixadas e provas novas.
- `errosPendentes` (tarefa 6): o que conta como "erro que ainda precisa ser
  revisto".

Em cada uma, os testes fixam só o que é obrigatório e o plano traz uma solução
de referência dobrada, para consulta.

---

### Tarefa 1: Base do projeto, tipos e configuração

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `tsconfig.build.json`
- Criar: `src/versao.ts`, `src/log.ts`, `src/config.ts`, `src/enem/tipos.ts`
- Teste: `testes/base.test.ts`

**Interfaces:**
- Consome: nada.
- Produz:
  - `VERSAO: string`
  - `log(...partes: unknown[]): void`
  - `diretorioDeDados(env?: NodeJS.ProcessEnv): string`
  - `AREAS`, `Area`, `NOMES_DAS_AREAS`, `IDIOMAS`, `Idioma`, `LETRAS`, `Letra`
  - `Alternativa`, `QuestaoPublica`, `Questao`, `Prova`
  - `ErroEnem`, `CodigoDeErro`
  - `chaveDaQuestao(q: { ano: number; numero: number; idioma: Idioma | null }): string`
  - `paraPublica(q: Questao): QuestaoPublica`

- [ ] **Passo 1: Criar `package.json`**

```json
{
  "name": "mcp-enem",
  "version": "0.1.0",
  "description": "Servidor MCP para estudar para o ENEM: questões reais, correção com gabarito oficial e acompanhamento de desempenho.",
  "type": "module",
  "bin": { "mcp-enem": "dist/servidor.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "tipos": "tsc -p tsconfig.json",
    "test": "vitest run",
    "verificar": "tsc -p tsconfig.json && vitest run"
  },
  "keywords": ["mcp", "enem", "model-context-protocol", "claude", "educacao"],
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/EduardoMilani8/mcp-enem.git" }
}
```

- [ ] **Passo 2: Instalar as dependências**

```bash
npm install @modelcontextprotocol/sdk@^1.32.1 zod@^4.6.5
```

```bash
npm install -D typescript@^7.0.2 vitest@^5.0.3 @types/node
```

Esperado: `package-lock.json` criado, sem erros.

- [ ] **Passo 3: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "testes"]
}
```

- [ ] **Passo 4: Criar `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Passo 5: Escrever o teste que falha**

`testes/base.test.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { diretorioDeDados } from "../src/config.js";
import { chaveDaQuestao, ErroEnem, paraPublica, type Questao } from "../src/enem/tipos.js";

const QUESTAO: Questao = {
  ano: 2023,
  numero: 95,
  area: "ciencias-natureza",
  idioma: null,
  contexto: null,
  enunciado: "Enunciado",
  imagens: [],
  alternativas: [{ letra: "A", texto: "Texto", imagem: null }],
  incompleta: false,
  gabarito: "A",
};

test("usa ~/.mcp-enem quando MCP_ENEM_DIR não está definida", () => {
  expect(diretorioDeDados({})).toBe(join(homedir(), ".mcp-enem"));
});

test("usa MCP_ENEM_DIR quando definida, ignorando espaços", () => {
  expect(diretorioDeDados({ MCP_ENEM_DIR: " /tmp/enem " })).toBe("/tmp/enem");
  expect(diretorioDeDados({ MCP_ENEM_DIR: "   " })).toBe(join(homedir(), ".mcp-enem"));
});

test("a chave da questão distingue o idioma", () => {
  expect(chaveDaQuestao({ ano: 2023, numero: 1, idioma: "ingles" })).toBe("2023-1-ingles");
  expect(chaveDaQuestao({ ano: 2023, numero: 1, idioma: "espanhol" })).toBe("2023-1-espanhol");
  expect(chaveDaQuestao({ ano: 2023, numero: 95, idioma: null })).toBe("2023-95-pt");
});

test("paraPublica remove o gabarito e mantém o resto", () => {
  const publica = paraPublica(QUESTAO);
  expect("gabarito" in publica).toBe(false);
  expect(publica.numero).toBe(95);
  expect(publica.alternativas).toEqual(QUESTAO.alternativas);
});

test("ErroEnem guarda o código", () => {
  const erro = new ErroEnem("limite", "muitas requisições");
  expect(erro).toBeInstanceOf(Error);
  expect(erro.codigo).toBe("limite");
  expect(erro.message).toBe("muitas requisições");
});
```

- [ ] **Passo 6: Rodar e ver falhar**

```bash
npx vitest run testes/base.test.ts
```

Esperado: FALHA, com erro de módulo não encontrado (`../src/config.js`).

- [ ] **Passo 7: Implementar**

`src/versao.ts`:

```ts
export const VERSAO = "0.1.0";
```

`src/log.ts`:

```ts
// O stdout é o canal do protocolo MCP; qualquer texto ali corrompe a conversa.
export function log(...partes: unknown[]): void {
  console.error("[mcp-enem]", ...partes);
}
```

`src/config.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export function diretorioDeDados(env: NodeJS.ProcessEnv = process.env): string {
  const personalizado = env.MCP_ENEM_DIR?.trim();
  return personalizado ? personalizado : join(homedir(), ".mcp-enem");
}
```

`src/enem/tipos.ts`:

```ts
export const AREAS = ["linguagens", "ciencias-humanas", "ciencias-natureza", "matematica"] as const;
export type Area = (typeof AREAS)[number];

export const NOMES_DAS_AREAS: Record<Area, string> = {
  linguagens: "Linguagens, Códigos e suas Tecnologias",
  "ciencias-humanas": "Ciências Humanas e suas Tecnologias",
  "ciencias-natureza": "Ciências da Natureza e suas Tecnologias",
  matematica: "Matemática e suas Tecnologias",
};

export const IDIOMAS = ["ingles", "espanhol"] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const LETRAS = ["A", "B", "C", "D", "E"] as const;
export type Letra = (typeof LETRAS)[number];

export interface Alternativa {
  letra: Letra;
  texto: string | null;
  imagem: string | null;
}

/** A questão como o aluno pode ver: sem o gabarito. */
export interface QuestaoPublica {
  ano: number;
  numero: number;
  area: Area;
  /** Só as questões de língua estrangeira têm idioma. */
  idioma: Idioma | null;
  contexto: string | null;
  enunciado: string | null;
  imagens: string[];
  alternativas: Alternativa[];
  /** Imagem quebrada na origem ou alternativa vazia: não serve para estudo. */
  incompleta: boolean;
}

export interface Questao extends QuestaoPublica {
  gabarito: Letra;
}

export interface Prova {
  ano: number;
  titulo: string;
  idiomas: Idioma[];
}

export type CodigoDeErro = "nao_encontrado" | "limite" | "indisponivel" | "resposta_invalida";

/** Erro esperado, com mensagem pronta para ser mostrada ao aluno. */
export class ErroEnem extends Error {
  readonly codigo: CodigoDeErro;

  constructor(codigo: CodigoDeErro, mensagem: string) {
    super(mensagem);
    this.name = "ErroEnem";
    this.codigo = codigo;
  }
}

export function chaveDaQuestao(q: { ano: number; numero: number; idioma: Idioma | null }): string {
  return `${q.ano}-${q.numero}-${q.idioma ?? "pt"}`;
}

export function paraPublica(questao: Questao): QuestaoPublica {
  const { gabarito: _gabarito, ...publica } = questao;
  return publica;
}
```

- [ ] **Passo 8: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: sem erros de tipo; 5 testes passando.

- [ ] **Passo 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json src testes
git commit -m "Cria a base do projeto com tipos e configuração"
```

---

### Tarefa 2: Leitura e gravação segura de JSON

**Arquivos:**
- Criar: `src/disco.ts`
- Criar: `testes/apoio.ts` (primeira parte)
- Teste: `testes/disco.test.ts`

**Interfaces:**
- Consome: `log` (tarefa 1).
- Produz:
  - `lerJson<T>(caminho: string): Promise<T | null>`: `null` se o arquivo não
    existe ou está corrompido (nesse caso o arquivo é apagado).
  - `gravarJson(caminho: string, dados: unknown): Promise<void>`: cria as
    pastas, grava num temporário e renomeia.
  - `pastaTemporaria(): Promise<string>` em `testes/apoio.ts`.

- [ ] **Passo 1: Criar `testes/apoio.ts`**

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pastaTemporaria(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mcp-enem-"));
}
```

- [ ] **Passo 2: Escrever o teste que falha**

`testes/disco.test.ts`:

```ts
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { gravarJson, lerJson } from "../src/disco.js";
import { pastaTemporaria } from "./apoio.js";

test("grava e lê de volta, criando as pastas", async () => {
  const caminho = join(await pastaTemporaria(), "a", "b", "dados.json");
  await gravarJson(caminho, { ano: 2023, lista: [1, 2] });
  expect(await lerJson(caminho)).toEqual({ ano: 2023, lista: [1, 2] });
});

test("arquivo inexistente devolve null", async () => {
  expect(await lerJson(join(await pastaTemporaria(), "nada.json"))).toBeNull();
});

test("arquivo corrompido devolve null e é apagado", async () => {
  const pasta = await pastaTemporaria();
  const caminho = join(pasta, "quebrado.json");
  await writeFile(caminho, '{"ano": 20', "utf8");
  expect(await lerJson(caminho)).toBeNull();
  expect(await readdir(pasta)).toEqual([]);
});

test("não deixa arquivo temporário para trás", async () => {
  const pasta = await pastaTemporaria();
  await gravarJson(join(pasta, "dados.json"), [1]);
  await gravarJson(join(pasta, "dados.json"), [2]);
  expect(await readdir(pasta)).toEqual(["dados.json"]);
  expect(await lerJson(join(pasta, "dados.json"))).toEqual([2]);
});
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npx vitest run testes/disco.test.ts
```

Esperado: FALHA, módulo `../src/disco.js` não encontrado.

- [ ] **Passo 4: Implementar `src/disco.ts`**

```ts
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { log } from "./log.js";

export async function lerJson<T>(caminho: string): Promise<T | null> {
  let texto: string;
  try {
    texto = await readFile(caminho, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    log(`arquivo corrompido, descartando: ${caminho}`);
    await rm(caminho, { force: true });
    return null;
  }
}

// Grava num temporário e renomeia: se o programa cair no meio, o arquivo
// antigo continua inteiro.
export async function gravarJson(caminho: string, dados: unknown): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.tmp`;
  await writeFile(temporario, JSON.stringify(dados), "utf8");
  await rename(temporario, caminho);
}
```

- [ ] **Passo 5: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 9 testes passando.

- [ ] **Passo 6: Commit**

```bash
git add src/disco.ts testes/apoio.ts testes/disco.test.ts
git commit -m "Adiciona leitura e gravação segura de JSON"
```

---

### Tarefa 3: Conversor e cliente da API

**Arquivos:**
- Criar: `src/enem/converter.ts`, `src/enem/api.ts`
- Modificar: `testes/apoio.ts` (acrescentar a API falsa)
- Teste: `testes/api.test.ts`

**Interfaces:**
- Consome: tipos e `ErroEnem` (tarefa 1), `log` (tarefa 1).
- Produz:
  - `QuestaoApi` e `converterQuestao(q: QuestaoApi): Questao | null`
  - `OpcoesDaApi { buscar?, esperar?, agora?, intervaloMs?, tempoLimiteMs?, urlBase? }`
  - `class ClienteApi` com `listarProvas(): Promise<Prova[]>` e
    `questoesDoAno(prova: Prova): Promise<Questao[]>`
  - Em `testes/apoio.ts`: `questaoApi`, `questoesDaProva`, `respostaJson`,
    `criarApiFalsa`

- [ ] **Passo 1: Acrescentar a API falsa em `testes/apoio.ts`**

Acrescente ao final do arquivo (e o import no topo):

```ts
import type { QuestaoApi } from "../src/enem/converter.js";

export function questaoApi(numero: number, extras: Partial<QuestaoApi> = {}): QuestaoApi {
  return {
    index: numero,
    year: 2023,
    discipline: "matematica",
    language: null,
    context: `Contexto ${numero}`,
    files: [],
    correctAlternative: "B",
    alternativesIntroduction: `Enunciado ${numero}`,
    alternatives: ["A", "B", "C", "D", "E"].map((letter) => ({
      letter,
      text: `Alternativa ${letter}`,
      file: null,
    })),
    ...extras,
  };
}

function areaDoNumero(numero: number): string {
  if (numero <= 45) return "linguagens";
  if (numero <= 90) return "ciencias-humanas";
  if (numero <= 135) return "ciencias-natureza";
  return "matematica";
}

/**
 * Uma prova parecida com a real: 180 questões, a 34 anulada, e as de 1 a 5
 * em cada idioma informado. O gabarito é sempre "B".
 */
export function questoesDaProva(
  ano: number,
  idiomas: string[] = ["espanhol", "ingles"],
  extras: Partial<QuestaoApi> = {},
): QuestaoApi[] {
  const lista: QuestaoApi[] = [];
  for (let numero = 1; numero <= 180; numero++) {
    if (numero === 34) continue;
    const base = { year: ano, discipline: areaDoNumero(numero), ...extras };
    if (numero <= 5 && idiomas.length > 0) {
      for (const language of idiomas) lista.push(questaoApi(numero, { ...base, language }));
    } else {
      lista.push(questaoApi(numero, base));
    }
  }
  return lista;
}

export function respostaJson(corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });
}

export interface ProvaFalsa {
  ano: number;
  idiomas: string[];
  questoes: QuestaoApi[];
}

/** Imita a api.enem.dev, incluindo o offset por número e o filtro de idioma. */
export function criarApiFalsa(provas: ProvaFalsa[]): { buscar: typeof fetch; chamadas: string[] } {
  const chamadas: string[] = [];
  const buscar: typeof fetch = async (entrada) => {
    const url = new URL(String(entrada));
    chamadas.push(url.pathname + url.search);
    const partes = url.pathname.split("/").filter(Boolean);
    if (partes.length === 2) {
      return respostaJson(
        provas.map((p) => ({
          title: `ENEM ${p.ano}`,
          year: p.ano,
          languages: p.idiomas.map((value) => ({ label: value, value })),
        })),
      );
    }
    const prova = provas.find((p) => p.ano === Number(partes[2]));
    if (!prova) return respostaJson({ error: { message: "No exam found" } }, 404);
    const pedido = url.searchParams.get("language");
    if (pedido && !prova.idiomas.includes(pedido)) {
      return respostaJson({ error: { message: `Language ${pedido} not found in exam` } }, 400);
    }
    const idioma = pedido ?? prova.idiomas[0] ?? null;
    const limite = Number(url.searchParams.get("limit") ?? 10);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (limite > 50) return respostaJson({ error: { message: "Limit cannot be greater than 50" } }, 400);
    const visiveis = prova.questoes.filter((q) => q.language === null || q.language === idioma);
    return respostaJson({
      metadata: {
        limit: limite,
        offset,
        total: prova.questoes.length,
        hasMore: visiveis.some((q) => q.index > offset + limite),
      },
      questions: visiveis.filter((q) => q.index >= offset && q.index <= offset + limite),
    });
  };
  return { buscar, chamadas };
}
```

- [ ] **Passo 2: Escrever os testes que falham**

`testes/api.test.ts`:

```ts
import { expect, test } from "vitest";
import { ClienteApi } from "../src/enem/api.js";
import { converterQuestao } from "../src/enem/converter.js";
import { chaveDaQuestao, ErroEnem, type Prova } from "../src/enem/tipos.js";
import { criarApiFalsa, questaoApi, questoesDaProva, respostaJson } from "./apoio.js";

const PROVA_2023: Prova = { ano: 2023, titulo: "ENEM 2023", idiomas: ["ingles", "espanhol"] };

function relogioFalso() {
  let instante = 0;
  const esperas: number[] = [];
  return {
    esperas,
    agora: () => instante,
    esperar: async (ms: number) => {
      esperas.push(ms);
      instante += ms;
    },
  };
}

test("converte uma questão da API para o formato interno", () => {
  const questao = converterQuestao(questaoApi(95, { discipline: "ciencias-natureza", files: ["https://enem.dev/a.png"] }));
  expect(questao).toMatchObject({
    ano: 2023,
    numero: 95,
    area: "ciencias-natureza",
    idioma: null,
    enunciado: "Enunciado 95",
    imagens: ["https://enem.dev/a.png"],
    gabarito: "B",
    incompleta: false,
  });
  expect(questao?.alternativas[0]).toEqual({ letra: "A", texto: "Alternativa A", imagem: null });
});

test("descarta questão com área ou gabarito desconhecidos", () => {
  expect(converterQuestao(questaoApi(1, { discipline: "redacao" }))).toBeNull();
  expect(converterQuestao(questaoApi(1, { correctAlternative: "X" }))).toBeNull();
  expect(converterQuestao(questaoApi(1, { alternatives: null }))).toBeNull();
});

test("marca como incompleta a questão com imagem quebrada ou alternativa vazia", () => {
  const quebrada = questaoApi(1, { context: "veja ![](https://enem.dev/broken-image.svg)" });
  expect(converterQuestao(quebrada)?.incompleta).toBe(true);
  const vazia = questaoApi(2, { alternatives: [{ letter: "A", text: null, file: null }] });
  expect(converterQuestao(vazia)?.incompleta).toBe(true);
});

test("lista as provas em ordem, com os idiomas de cada uma", async () => {
  const api = criarApiFalsa([
    { ano: 2023, idiomas: ["espanhol", "ingles"], questoes: [] },
    { ano: 2009, idiomas: [], questoes: [] },
  ]);
  const cliente = new ClienteApi({ buscar: api.buscar, intervaloMs: 0 });
  expect(await cliente.listarProvas()).toEqual([
    { ano: 2009, titulo: "ENEM 2009", idiomas: [] },
    { ano: 2023, titulo: "ENEM 2023", idiomas: ["ingles", "espanhol"] },
  ]);
});

test("baixa o ano inteiro, com os dois idiomas e sem duplicatas", async () => {
  const api = criarApiFalsa([{ ano: 2023, idiomas: ["espanhol", "ingles"], questoes: questoesDaProva(2023) }]);
  const cliente = new ClienteApi({ buscar: api.buscar, intervaloMs: 0 });
  const questoes = await cliente.questoesDoAno(PROVA_2023);
  expect(questoes).toHaveLength(184);
  expect(new Set(questoes.map(chaveDaQuestao)).size).toBe(184);
  expect(questoes.filter((q) => q.numero === 1).map((q) => q.idioma).sort()).toEqual(["espanhol", "ingles"]);
  expect(questoes.some((q) => q.numero === 34)).toBe(false);
  expect(api.chamadas.length).toBeLessThanOrEqual(6);
});

test("acha as questões de língua estrangeira fora do começo da prova", async () => {
  const questoes = [];
  for (let n = 1; n <= 100; n++) {
    if (n >= 91 && n <= 95) {
      questoes.push(questaoApi(n, { language: "espanhol" }), questaoApi(n, { language: "ingles" }));
    } else {
      questoes.push(questaoApi(n));
    }
  }
  const api = criarApiFalsa([{ ano: 2015, idiomas: ["espanhol", "ingles"], questoes }]);
  const cliente = new ClienteApi({ buscar: api.buscar, intervaloMs: 0 });
  const baixadas = await cliente.questoesDoAno({ ano: 2015, titulo: "ENEM 2015", idiomas: ["ingles", "espanhol"] });
  expect(baixadas.filter((q) => q.idioma === "ingles").map((q) => q.numero)).toEqual([91, 92, 93, 94, 95]);
  expect(baixadas).toHaveLength(105);
});

test("não pede um idioma que a prova não tem", async () => {
  const api = criarApiFalsa([
    { ano: 2011, idiomas: ["espanhol"], questoes: questoesDaProva(2011, ["espanhol"]) },
    { ano: 2009, idiomas: [], questoes: questoesDaProva(2009, []) },
  ]);
  const cliente = new ClienteApi({ buscar: api.buscar, intervaloMs: 0 });
  const de2011 = await cliente.questoesDoAno({ ano: 2011, titulo: "ENEM 2011", idiomas: ["espanhol"] });
  const de2009 = await cliente.questoesDoAno({ ano: 2009, titulo: "ENEM 2009", idiomas: [] });
  expect(de2011).toHaveLength(179);
  expect(de2009).toHaveLength(179);
  expect(api.chamadas.some((c) => c.includes("language="))).toBe(false);
});

test("espera o intervalo mínimo entre requisições", async () => {
  const api = criarApiFalsa([{ ano: 2023, idiomas: [], questoes: [] }]);
  const relogio = relogioFalso();
  const cliente = new ClienteApi({ buscar: api.buscar, intervaloMs: 1100, agora: relogio.agora, esperar: relogio.esperar });
  await cliente.listarProvas();
  await cliente.listarProvas();
  expect(relogio.esperas).toEqual([1100]);
});

test("ao receber 429, espera o tempo do cabeçalho e tenta de novo", async () => {
  const api = criarApiFalsa([{ ano: 2023, idiomas: [], questoes: [] }]);
  const relogio = relogioFalso();
  let primeira = true;
  const buscar: typeof fetch = async (entrada, init) => {
    if (primeira) {
      primeira = false;
      return respostaJson({ error: {} }, 429, { "x-ratelimit-reset": "2000" });
    }
    return api.buscar(entrada, init);
  };
  const cliente = new ClienteApi({ buscar, intervaloMs: 0, agora: relogio.agora, esperar: relogio.esperar });
  expect(await cliente.listarProvas()).toHaveLength(1);
  expect(relogio.esperas).toContain(2000);
});

test("desiste depois de três respostas 429", async () => {
  const relogio = relogioFalso();
  const buscar: typeof fetch = async () => respostaJson({ error: {} }, 429);
  const cliente = new ClienteApi({ buscar, intervaloMs: 0, agora: relogio.agora, esperar: relogio.esperar });
  await expect(cliente.listarProvas()).rejects.toMatchObject({ name: "ErroEnem", codigo: "limite" });
});

test("falha de rede vira ErroEnem 'indisponivel'", async () => {
  const buscar: typeof fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const cliente = new ClienteApi({ buscar, intervaloMs: 0 });
  const erro = await cliente.listarProvas().catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(ErroEnem);
  expect((erro as ErroEnem).codigo).toBe("indisponivel");
});

test("erro 500 e corpo que não é JSON viram ErroEnem", async () => {
  const quebrada = new ClienteApi({ buscar: async () => respostaJson({}, 500), intervaloMs: 0 });
  await expect(quebrada.listarProvas()).rejects.toMatchObject({ codigo: "indisponivel" });
  const html = new ClienteApi({ buscar: async () => new Response("<html>"), intervaloMs: 0 });
  await expect(html.listarProvas()).rejects.toMatchObject({ codigo: "resposta_invalida" });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npx vitest run testes/api.test.ts
```

Esperado: FALHA, módulos `../src/enem/api.js` e `converter.js` não encontrados.

- [ ] **Passo 4: Implementar `src/enem/converter.ts`**

```ts
import { AREAS, IDIOMAS, LETRAS, type Alternativa, type Questao } from "./tipos.js";

/** A questão no formato em que a api.enem.dev devolve. */
export interface QuestaoApi {
  index: number;
  year: number;
  discipline: string | null;
  language: string | null;
  context: string | null;
  files: string[] | null;
  correctAlternative: string | null;
  alternativesIntroduction: string | null;
  alternatives: { letter: string; text: string | null; file: string | null }[] | null;
}

const MARCA_DE_IMAGEM_QUEBRADA = "broken-image";

/** Devolve null quando a questão não tem o mínimo para ser usada. */
export function converterQuestao(q: QuestaoApi): Questao | null {
  const area = AREAS.find((a) => a === q.discipline);
  const gabarito = LETRAS.find((l) => l === q.correctAlternative);
  if (!area || !gabarito || !Array.isArray(q.alternatives) || q.alternatives.length === 0) return null;

  const alternativas: Alternativa[] = [];
  for (const a of q.alternatives) {
    const letra = LETRAS.find((l) => l === a.letter);
    if (!letra) return null;
    alternativas.push({ letra, texto: a.text ?? null, imagem: a.file ?? null });
  }

  const imagens = q.files ?? [];
  const enderecos = [...imagens, ...alternativas.map((a) => a.imagem ?? "")];
  const incompleta =
    (q.context ?? "").includes(MARCA_DE_IMAGEM_QUEBRADA) ||
    enderecos.some((endereco) => endereco.includes(MARCA_DE_IMAGEM_QUEBRADA)) ||
    alternativas.some((a) => !a.texto && !a.imagem);

  return {
    ano: q.year,
    numero: q.index,
    area,
    idioma: IDIOMAS.find((i) => i === q.language) ?? null,
    contexto: q.context ?? null,
    enunciado: q.alternativesIntroduction ?? null,
    imagens,
    alternativas,
    incompleta,
    gabarito,
  };
}
```

- [ ] **Passo 5: Implementar `src/enem/api.ts`**

```ts
import { log } from "../log.js";
import { converterQuestao, type QuestaoApi } from "./converter.js";
import { chaveDaQuestao, ErroEnem, IDIOMAS, type Idioma, type Prova, type Questao } from "./tipos.js";

interface PaginaApi {
  metadata?: { hasMore?: boolean };
  questions?: QuestaoApi[];
}

interface ProvaApi {
  title?: string;
  year?: number;
  languages?: { value?: string }[];
}

export interface OpcoesDaApi {
  buscar?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  /** Tempo mínimo entre duas requisições. A API aceita 10 a cada 10 s. */
  intervaloMs?: number;
  tempoLimiteMs?: number;
  urlBase?: string;
}

const TAMANHO_DA_PAGINA = 50;
const MAXIMO_DE_PAGINAS = 8;
const MAXIMO_DE_TENTATIVAS = 3;
const ESPERA_MAXIMA_MS = 15_000;

export class ClienteApi {
  private readonly buscar: typeof fetch;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly agora: () => number;
  private readonly intervaloMs: number;
  private readonly tempoLimiteMs: number;
  private readonly urlBase: string;
  private ultimoPedido = Number.NEGATIVE_INFINITY;
  private fila: Promise<unknown> = Promise.resolve();

  constructor(opcoes: OpcoesDaApi = {}) {
    this.buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
    this.esperar = opcoes.esperar ?? ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));
    this.agora = opcoes.agora ?? Date.now;
    this.intervaloMs = opcoes.intervaloMs ?? 1100;
    this.tempoLimiteMs = opcoes.tempoLimiteMs ?? 15_000;
    this.urlBase = opcoes.urlBase ?? "https://api.enem.dev/v1";
  }

  async listarProvas(): Promise<Prova[]> {
    const bruto = await this.pedir<ProvaApi[]>("/exams");
    if (!Array.isArray(bruto)) {
      throw new ErroEnem("resposta_invalida", "A API do ENEM devolveu a lista de provas em um formato inesperado.");
    }
    const provas: Prova[] = [];
    for (const p of bruto) {
      if (typeof p.year !== "number") continue;
      const idiomas = IDIOMAS.filter((i) => (p.languages ?? []).some((l) => l.value === i));
      provas.push({ ano: p.year, titulo: p.title ?? `ENEM ${p.year}`, idiomas });
    }
    return provas.sort((a, b) => a.ano - b.ano);
  }

  async questoesDoAno(prova: Prova): Promise<Questao[]> {
    const porChave = new Map<string, Questao>();
    const juntar = (pagina: PaginaApi, apenasIdioma?: Idioma): number => {
      let novas = 0;
      for (const bruta of pagina.questions ?? []) {
        const questao = converterQuestao(bruta);
        if (!questao) {
          log(`questão ${bruta?.index} de ${prova.ano} ignorada: formato inesperado`);
          continue;
        }
        if (apenasIdioma && questao.idioma !== apenasIdioma) continue;
        const chave = chaveDaQuestao(questao);
        if (!porChave.has(chave)) {
          porChave.set(chave, questao);
          novas++;
        }
      }
      return novas;
    };

    // O offset da API é o número da questão, e as páginas se sobrepõem em uma.
    for (let pagina = 0, offset = 0; pagina < MAXIMO_DE_PAGINAS; pagina++, offset += TAMANHO_DA_PAGINA) {
      const resposta = await this.pedir<PaginaApi>(
        `/exams/${prova.ano}/questions?limit=${TAMANHO_DA_PAGINA}&offset=${offset}`,
      );
      const novas = juntar(resposta);
      if (!resposta.metadata?.hasMore || novas === 0) break;
    }

    // Sem "language" a API só devolve um idioma. Os outros são pedidos à parte,
    // só no trecho da prova onde ficam as questões de língua estrangeira.
    const estrangeiras = [...porChave.values()].filter((q) => q.idioma !== null);
    if (estrangeiras.length > 0) {
      const numeros = estrangeiras.map((q) => q.numero);
      const inicio = Math.min(...numeros);
      const tamanho = Math.max(...numeros) - inicio + 1;
      const jaBaixados = new Set(estrangeiras.map((q) => q.idioma));
      for (const idioma of prova.idiomas) {
        if (jaBaixados.has(idioma)) continue;
        const resposta = await this.pedir<PaginaApi>(
          `/exams/${prova.ano}/questions?limit=${tamanho}&offset=${inicio}&language=${idioma}`,
        );
        juntar(resposta, idioma);
      }
    }

    return [...porChave.values()].sort(
      (a, b) => a.numero - b.numero || (a.idioma ?? "").localeCompare(b.idioma ?? ""),
    );
  }

  // Uma requisição por vez: é o que garante o intervalo mínimo entre elas.
  private pedir<T>(caminho: string): Promise<T> {
    const pedido = this.fila.then(() => this.pedirAgora<T>(caminho));
    this.fila = pedido.catch(() => undefined);
    return pedido;
  }

  private async pedirAgora<T>(caminho: string): Promise<T> {
    for (let tentativa = 1; ; tentativa++) {
      const falta = this.ultimoPedido + this.intervaloMs - this.agora();
      if (falta > 0) await this.esperar(falta);
      this.ultimoPedido = this.agora();

      let resposta: Response;
      try {
        resposta = await this.buscar(this.urlBase + caminho, {
          signal: AbortSignal.timeout(this.tempoLimiteMs),
          headers: { accept: "application/json" },
        });
      } catch {
        throw new ErroEnem(
          "indisponivel",
          "Não consegui falar com a API do ENEM (enem.dev). Verifique a internet ou tente de novo em instantes.",
        );
      }

      if (resposta.status === 429) {
        if (tentativa >= MAXIMO_DE_TENTATIVAS) {
          throw new ErroEnem("limite", "A API do ENEM está limitando as requisições. Aguarde um minuto e tente de novo.");
        }
        const pedida = Number(resposta.headers.get("x-ratelimit-reset"));
        await this.esperar(Math.min(pedida > 0 ? pedida : 10_000, ESPERA_MAXIMA_MS));
        continue;
      }
      if (resposta.status === 404) {
        throw new ErroEnem("nao_encontrado", "A API do ENEM não encontrou o que foi pedido.");
      }
      if (!resposta.ok) {
        throw new ErroEnem("indisponivel", `A API do ENEM respondeu com o erro ${resposta.status}. Tente de novo em instantes.`);
      }
      try {
        return (await resposta.json()) as T;
      } catch {
        throw new ErroEnem("resposta_invalida", "A API do ENEM devolveu uma resposta que não consegui ler.");
      }
    }
  }
}
```

- [ ] **Passo 6: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 21 testes passando, sem erros de tipo.

- [ ] **Passo 7: Commit**

```bash
git add src/enem testes/apoio.ts testes/api.test.ts
git commit -m "Adiciona o cliente da API enem.dev com limite e paginação"
```

---

### Tarefa 4: Repositório com cache em disco

**Arquivos:**
- Criar: `src/enem/repositorio.ts`
- Teste: `testes/repositorio.test.ts`

**Interfaces:**
- Consome: `ClienteApi` (tarefa 3), `lerJson`/`gravarJson` (tarefa 2), tipos.
- Produz:
  - `interface FonteDeDados { listarProvas(): Promise<Prova[]>; questoesDoAno(prova: Prova): Promise<Questao[]> }`
  - `class RepositorioEnem`, construtor `(fonte: FonteDeDados, pasta: string, agora?: () => number)`
    - `listarProvas(): Promise<Prova[]>`
    - `anosEmCache(): Promise<number[]>`
    - `anosDisponiveis(): Promise<number[]>`
    - `questoesDoAno(ano: number): Promise<Questao[]>`
    - `obterQuestao(ano: number, numero: number, idioma?: Idioma): Promise<Questao>`

- [ ] **Passo 1: Escrever os testes que falham**

`testes/repositorio.test.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ClienteApi } from "../src/enem/api.js";
import { RepositorioEnem, type FonteDeDados } from "../src/enem/repositorio.js";
import { ErroEnem } from "../src/enem/tipos.js";
import { criarApiFalsa, pastaTemporaria, questoesDaProva } from "./apoio.js";

function apiPadrao() {
  return criarApiFalsa([
    { ano: 2022, idiomas: ["espanhol", "ingles"], questoes: questoesDaProva(2022) },
    { ano: 2023, idiomas: ["espanhol", "ingles"], questoes: questoesDaProva(2023) },
  ]);
}

const FONTE_FORA_DO_AR: FonteDeDados = {
  listarProvas: async () => {
    throw new ErroEnem("indisponivel", "sem rede");
  },
  questoesDoAno: async () => {
    throw new ErroEnem("indisponivel", "sem rede");
  },
};

test("baixa cada ano uma única vez, mesmo em outra instância", async () => {
  const api = apiPadrao();
  const pasta = await pastaTemporaria();
  const fonte = new ClienteApi({ buscar: api.buscar, intervaloMs: 0 });

  const primeiro = new RepositorioEnem(fonte, pasta);
  expect(await primeiro.questoesDoAno(2023)).toHaveLength(184);
  const depoisDeBaixar = api.chamadas.length;
  await primeiro.questoesDoAno(2023);
  expect(api.chamadas.length).toBe(depoisDeBaixar);

  const segundo = new RepositorioEnem(fonte, pasta);
  expect(await segundo.questoesDoAno(2023)).toHaveLength(184);
  expect(api.chamadas.length).toBe(depoisDeBaixar);
});

test("ano inexistente diz quais anos existem", async () => {
  const api = apiPadrao();
  const repositorio = new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), await pastaTemporaria());
  const erro = await repositorio.questoesDoAno(1990).catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(ErroEnem);
  expect((erro as ErroEnem).codigo).toBe("nao_encontrado");
  expect((erro as ErroEnem).message).toContain("2022, 2023");
});

test("obterQuestao escolhe o idioma pedido e usa inglês como padrão", async () => {
  const api = apiPadrao();
  const repositorio = new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), await pastaTemporaria());
  expect((await repositorio.obterQuestao(2023, 1)).idioma).toBe("ingles");
  expect((await repositorio.obterQuestao(2023, 1, "espanhol")).idioma).toBe("espanhol");
  expect((await repositorio.obterQuestao(2023, 100, "espanhol")).idioma).toBeNull();
});

test("questão anulada dá erro explicando", async () => {
  const api = apiPadrao();
  const repositorio = new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), await pastaTemporaria());
  const erro = await repositorio.obterQuestao(2023, 34).catch((e: unknown) => e);
  expect((erro as ErroEnem).codigo).toBe("nao_encontrado");
  expect((erro as ErroEnem).message).toContain("anulada");
  expect((erro as ErroEnem).message).toContain("1 a 180");
});

test("sem rede, usa o que já está em cache", async () => {
  const api = apiPadrao();
  const pasta = await pastaTemporaria();
  await new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), pasta).questoesDoAno(2023);

  const semRede = new RepositorioEnem(FONTE_FORA_DO_AR, pasta);
  expect(await semRede.questoesDoAno(2023)).toHaveLength(184);
  expect(await semRede.anosEmCache()).toEqual([2023]);
  await expect(semRede.questoesDoAno(2022)).rejects.toMatchObject({ codigo: "indisponivel" });
});

test("lista de provas vencida ainda serve quando a rede cai", async () => {
  const api = apiPadrao();
  const pasta = await pastaTemporaria();
  let instante = 0;
  await new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), pasta, () => instante).listarProvas();

  instante = 30 * 24 * 60 * 60 * 1000;
  const semRede = new RepositorioEnem(FONTE_FORA_DO_AR, pasta, () => instante);
  expect((await semRede.listarProvas()).map((p) => p.ano)).toEqual([2022, 2023]);
});

test("anosDisponiveis cai para os anos em cache quando não há lista de provas", async () => {
  const pasta = await pastaTemporaria();
  await writeFile(join(pasta, "2021.json"), JSON.stringify([{ ano: 2021 }]), "utf8");
  const semRede = new RepositorioEnem(FONTE_FORA_DO_AR, pasta);
  expect(await semRede.anosDisponiveis()).toEqual([2021]);
  await expect(new RepositorioEnem(FONTE_FORA_DO_AR, await pastaTemporaria()).anosDisponiveis()).rejects.toMatchObject({
    codigo: "indisponivel",
  });
});

test("cache corrompido ou vazio é baixado de novo", async () => {
  const api = apiPadrao();
  const pasta = await pastaTemporaria();
  await writeFile(join(pasta, "2023.json"), "{ quebrado", "utf8");
  await writeFile(join(pasta, "2022.json"), "[]", "utf8");
  const repositorio = new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), pasta);
  expect(await repositorio.questoesDoAno(2023)).toHaveLength(184);
  expect(await repositorio.questoesDoAno(2022)).toHaveLength(184);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run testes/repositorio.test.ts
```

Esperado: FALHA, módulo `../src/enem/repositorio.js` não encontrado.

- [ ] **Passo 3: Implementar `src/enem/repositorio.ts`**

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gravarJson, lerJson } from "../disco.js";
import { ErroEnem, type Idioma, type Prova, type Questao } from "./tipos.js";

export interface FonteDeDados {
  listarProvas(): Promise<Prova[]>;
  questoesDoAno(prova: Prova): Promise<Questao[]>;
}

interface ProvasGuardadas {
  baixadoEm: number;
  provas: Prova[];
}

// A lista de provas pode ganhar um ano novo; as questões de um ano nunca mudam.
const VALIDADE_DA_LISTA_DE_PROVAS_MS = 7 * 24 * 60 * 60 * 1000;

export class RepositorioEnem {
  private readonly fonte: FonteDeDados;
  private readonly pasta: string;
  private readonly agora: () => number;
  private readonly anosNaMemoria = new Map<number, Questao[]>();

  constructor(fonte: FonteDeDados, pasta: string, agora: () => number = Date.now) {
    this.fonte = fonte;
    this.pasta = pasta;
    this.agora = agora;
  }

  async listarProvas(): Promise<Prova[]> {
    const caminho = join(this.pasta, "provas.json");
    const guardado = await lerJson<ProvasGuardadas>(caminho);
    const provasGuardadas =
      guardado !== null && Array.isArray(guardado.provas) && guardado.provas.length > 0 ? guardado.provas : null;
    if (provasGuardadas && guardado && this.agora() - guardado.baixadoEm < VALIDADE_DA_LISTA_DE_PROVAS_MS) {
      return provasGuardadas;
    }
    try {
      const provas = await this.fonte.listarProvas();
      if (provas.length === 0) throw new ErroEnem("resposta_invalida", "A API do ENEM não devolveu nenhuma prova.");
      const paraGuardar: ProvasGuardadas = { baixadoEm: this.agora(), provas };
      await gravarJson(caminho, paraGuardar);
      return provas;
    } catch (erro) {
      if (provasGuardadas) return provasGuardadas;
      throw erro;
    }
  }

  async anosEmCache(): Promise<number[]> {
    let nomes: string[];
    try {
      nomes = await readdir(this.pasta);
    } catch {
      return [];
    }
    const anos: number[] = [];
    for (const nome of nomes) {
      const achado = /^(\d{4})\.json$/.exec(nome);
      if (achado?.[1]) anos.push(Number(achado[1]));
    }
    return anos.sort((a, b) => a - b);
  }

  /** Os anos que dá para usar agora; sem rede, só os que já foram baixados. */
  async anosDisponiveis(): Promise<number[]> {
    try {
      return (await this.listarProvas()).map((p) => p.ano);
    } catch (erro) {
      const emCache = await this.anosEmCache();
      if (emCache.length > 0) return emCache;
      throw erro;
    }
  }

  async questoesDoAno(ano: number): Promise<Questao[]> {
    const naMemoria = this.anosNaMemoria.get(ano);
    if (naMemoria) return naMemoria;

    const caminho = join(this.pasta, `${ano}.json`);
    const guardadas = await lerJson<Questao[]>(caminho);
    if (Array.isArray(guardadas) && guardadas.length > 0) {
      this.anosNaMemoria.set(ano, guardadas);
      return guardadas;
    }

    const provas = await this.listarProvas();
    const prova = provas.find((p) => p.ano === ano);
    if (!prova) {
      throw new ErroEnem(
        "nao_encontrado",
        `Não há prova do ENEM de ${ano}. Anos disponíveis: ${provas.map((p) => p.ano).join(", ")}.`,
      );
    }
    const questoes = await this.fonte.questoesDoAno(prova);
    if (questoes.length === 0) {
      throw new ErroEnem("resposta_invalida", `A API do ENEM não devolveu questões para ${ano}.`);
    }
    await gravarJson(caminho, questoes);
    this.anosNaMemoria.set(ano, questoes);
    return questoes;
  }

  async obterQuestao(ano: number, numero: number, idioma: Idioma = "ingles"): Promise<Questao> {
    const questoes = await this.questoesDoAno(ano);
    const candidatas = questoes.filter((q) => q.numero === numero);
    const escolhida =
      candidatas.find((q) => q.idioma === idioma) ?? candidatas.find((q) => q.idioma === null) ?? candidatas[0];
    if (!escolhida) {
      const numeros = questoes.map((q) => q.numero);
      throw new ErroEnem(
        "nao_encontrado",
        `A questão ${numero} do ENEM ${ano} não está disponível (pode ter sido anulada). ` +
          `Os números vão de ${Math.min(...numeros)} a ${Math.max(...numeros)}.`,
      );
    }
    return escolhida;
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 29 testes passando.

- [ ] **Passo 5: Commit**

```bash
git add src/enem/repositorio.ts testes/repositorio.test.ts
git commit -m "Adiciona o repositório de questões com cache em disco"
```

---

### Tarefa 5: Filtro e sorteio de questões

**Arquivos:**
- Criar: `src/ferramentas/sorteio.ts`
- Teste: `testes/sorteio.test.ts`

**Interfaces:**
- Consome: tipos e `chaveDaQuestao` (tarefa 1), `converterQuestao` e
  `questaoApi` (tarefa 3, só nos testes).
- Produz:
  - `interface Filtro { area?: Area; idioma: Idioma; apenasTexto: boolean; excluir: ReadonlySet<string> }`
  - `temImagem(q: QuestaoPublica): boolean`
  - `filtrar(questoes: Questao[], filtro: Filtro): Questao[]`
  - `sortear<T>(itens: readonly T[], quantidade: number, aleatorio?: () => number): T[]`
  - `escolherAno(disponiveis: readonly number[], emCache: readonly number[], aleatorio?: () => number): number`

- [ ] **Passo 1: Escrever os testes que falham**

`testes/sorteio.test.ts`:

```ts
import { expect, test } from "vitest";
import { converterQuestao } from "../src/enem/converter.js";
import type { Questao } from "../src/enem/tipos.js";
import { escolherAno, filtrar, sortear, temImagem, type Filtro } from "../src/ferramentas/sorteio.js";
import { questaoApi } from "./apoio.js";

function questao(numero: number, extras: Parameters<typeof questaoApi>[1] = {}): Questao {
  const convertida = converterQuestao(questaoApi(numero, extras));
  if (!convertida) throw new Error("questão de teste inválida");
  return convertida;
}

const SEM_FILTRO: Filtro = { idioma: "ingles", apenasTexto: false, excluir: new Set() };

test("filtra por área", () => {
  const lista = [questao(1, { discipline: "linguagens" }), questao(140)];
  expect(filtrar(lista, { ...SEM_FILTRO, area: "matematica" }).map((q) => q.numero)).toEqual([140]);
});

test("mantém só o idioma pedido nas questões de língua estrangeira", () => {
  const lista = [questao(1, { language: "ingles" }), questao(1, { language: "espanhol" }), questao(6)];
  expect(filtrar(lista, SEM_FILTRO).map((q) => q.idioma)).toEqual(["ingles", null]);
  expect(filtrar(lista, { ...SEM_FILTRO, idioma: "espanhol" }).map((q) => q.idioma)).toEqual(["espanhol", null]);
});

test("prova sem o idioma pedido não quebra: só ficam as questões comuns", () => {
  const lista = [questao(1, { language: "espanhol" }), questao(6)];
  expect(filtrar(lista, SEM_FILTRO).map((q) => q.numero)).toEqual([6]);
});

test("sempre descarta questões incompletas", () => {
  const lista = [questao(1, { context: "![](https://enem.dev/broken-image.svg)" }), questao(2)];
  expect(filtrar(lista, SEM_FILTRO).map((q) => q.numero)).toEqual([2]);
});

test("apenasTexto descarta questões com qualquer imagem", () => {
  const comArquivo = questao(1, { files: ["https://enem.dev/a.png"] });
  const comImagemNoTexto = questao(2, { context: "Veja ![](https://enem.dev/b.png)" });
  const comImagemNaAlternativa = questao(3, {
    alternatives: [{ letter: "A", text: null, file: "https://enem.dev/c.png" }],
  });
  const soTexto = questao(4);
  expect([comArquivo, comImagemNoTexto, comImagemNaAlternativa, soTexto].map(temImagem)).toEqual([true, true, true, false]);
  const lista = [comArquivo, comImagemNoTexto, comImagemNaAlternativa, soTexto];
  expect(filtrar(lista, { ...SEM_FILTRO, apenasTexto: true }).map((q) => q.numero)).toEqual([4]);
});

test("exclui as questões já respondidas", () => {
  const lista = [questao(10), questao(11)];
  expect(filtrar(lista, { ...SEM_FILTRO, excluir: new Set(["2023-10-pt"]) }).map((q) => q.numero)).toEqual([11]);
});

test("sortear devolve itens distintos e não altera a lista original", () => {
  const itens = [1, 2, 3, 4, 5];
  const sorteados = sortear(itens, 3, () => 0.5);
  expect(sorteados).toHaveLength(3);
  expect(new Set(sorteados).size).toBe(3);
  expect(itens).toEqual([1, 2, 3, 4, 5]);
});

test("sortear devolve tudo quando pedem mais do que existe, e nada para zero", () => {
  expect(sortear([1, 2], 10).sort()).toEqual([1, 2]);
  expect(sortear([1, 2], 0)).toEqual([]);
  expect(sortear([], 3)).toEqual([]);
});

test("escolherAno sempre devolve um ano disponível", () => {
  const disponiveis = [2021, 2022, 2023];
  for (const sorte of [0, 0.25, 0.5, 0.75, 0.999]) {
    expect(disponiveis).toContain(escolherAno(disponiveis, [], () => sorte));
    expect(disponiveis).toContain(escolherAno(disponiveis, [2022], () => sorte));
    expect(disponiveis).toContain(escolherAno(disponiveis, [1999, 2022], () => sorte));
  }
});

test("escolherAno devolve o único ano quando só há um", () => {
  expect(escolherAno([2023], [], () => 0.9)).toBe(2023);
  expect(escolherAno([2023], [2023], () => 0.1)).toBe(2023);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run testes/sorteio.test.ts
```

Esperado: FALHA, módulo `../src/ferramentas/sorteio.js` não encontrado.

- [ ] **Passo 3: Implementar `src/ferramentas/sorteio.ts` (menos `escolherAno`)**

```ts
import { chaveDaQuestao, type Area, type Idioma, type Questao, type QuestaoPublica } from "../enem/tipos.js";

export interface Filtro {
  area?: Area;
  idioma: Idioma;
  apenasTexto: boolean;
  /** Chaves (ver chaveDaQuestao) das questões que não devem aparecer. */
  excluir: ReadonlySet<string>;
}

const IMAGEM_EM_MARKDOWN = /!\[[^\]]*\]\(/;

export function temImagem(questao: QuestaoPublica): boolean {
  return (
    questao.imagens.length > 0 ||
    questao.alternativas.some((a) => a.imagem !== null) ||
    IMAGEM_EM_MARKDOWN.test(questao.contexto ?? "")
  );
}

export function filtrar(questoes: Questao[], filtro: Filtro): Questao[] {
  return questoes.filter(
    (q) =>
      !q.incompleta &&
      (filtro.area === undefined || q.area === filtro.area) &&
      (q.idioma === null || q.idioma === filtro.idioma) &&
      (!filtro.apenasTexto || !temImagem(q)) &&
      !filtro.excluir.has(chaveDaQuestao(q)),
  );
}

/** Embaralha uma cópia (Fisher-Yates) e devolve os primeiros itens. */
export function sortear<T>(itens: readonly T[], quantidade: number, aleatorio: () => number = Math.random): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia.slice(0, Math.max(0, quantidade));
}
```

- [ ] **Passo 4: ✍️ Eduardo escreve `escolherAno`**

Acrescente a função ao final de `src/ferramentas/sorteio.ts`:

```ts
/**
 * Escolhe de que ano sortear quando o aluno não pediu um ano específico.
 * `disponiveis` nunca vem vazio. `emCache` são os anos já baixados (pode
 * conter anos que não estão em `disponiveis`; ignore esses).
 */
export function escolherAno(
  disponiveis: readonly number[],
  emCache: readonly number[],
  aleatorio: () => number = Math.random,
): number {
  // Eduardo: sua implementação aqui (5 a 10 linhas).
}
```

A decisão: um ano já baixado responde na hora e funciona sem internet; um ano
novo custa cerca de 5 segundos de download, mas dá variedade. Algumas opções:

- **Sempre o cache, se houver:** rápido, mas o aluno fica preso nas mesmas
  provas para sempre.
- **Sempre aleatório entre todos:** máxima variedade, mas as primeiras 15
  sessões pagam o download.
- **Misto:** na maioria das vezes usa o cache, e de vez em quando baixa um ano
  novo.

Os testes só exigem que o resultado seja um dos `disponiveis`. Use
`aleatorio()` (um número de 0 a 1) em vez de `Math.random()` para os testes
serem previsíveis, e `sortear(lista, 1, aleatorio)[0]` para pegar um item.

<details>
<summary>Solução de referência (misto, 70% cache)</summary>

```ts
export function escolherAno(
  disponiveis: readonly number[],
  emCache: readonly number[],
  aleatorio: () => number = Math.random,
): number {
  const baixados = disponiveis.filter((ano) => emCache.includes(ano));
  const novos = disponiveis.filter((ano) => !emCache.includes(ano));
  const usarBaixados = baixados.length > 0 && (novos.length === 0 || aleatorio() < 0.7);
  const opcoes = usarBaixados ? baixados : novos.length > 0 ? novos : disponiveis;
  return sortear(opcoes, 1, aleatorio)[0] ?? disponiveis[0]!;
}
```

</details>

- [ ] **Passo 5: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 39 testes passando.

- [ ] **Passo 6: Commit**

```bash
git add src/ferramentas/sorteio.ts testes/sorteio.test.ts
git commit -m "Adiciona filtro e sorteio de questões"
```

---

### Tarefa 6: Histórico e estatísticas

**Arquivos:**
- Criar: `src/historico/historico.ts`, `src/historico/estatisticas.ts`
- Teste: `testes/historico.test.ts`

**Interfaces:**
- Consome: tipos e `chaveDaQuestao` (tarefa 1), `log`.
- Produz:
  - `type Tentativa = { quando: string; ano: number; numero: number; idioma: Idioma | null; area: Area; resposta: Letra; correta: Letra; acertou: boolean }`
  - `class Historico`, construtor `(caminho: string)`, com
    `registrar(t: Tentativa): Promise<void>` e `ler(): Promise<Tentativa[]>`
  - `interface Placar { total: number; acertos: number; percentual: number }`
  - `interface Desempenho { geral: Placar; porArea: Partial<Record<Area, Placar>>; ultimos7Dias: Placar }`
  - `calcularDesempenho(tentativas: Tentativa[], opcoes?: { area?: Area; dias?: number; agora?: Date }): Desempenho`
  - `chavesRespondidas(tentativas: Tentativa[]): Set<string>`
  - `errosPendentes(tentativas: Tentativa[]): Tentativa[]`

- [ ] **Passo 1: Escrever os testes que falham**

`testes/historico.test.ts`:

```ts
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { calcularDesempenho, chavesRespondidas, errosPendentes } from "../src/historico/estatisticas.js";
import { Historico, type Tentativa } from "../src/historico/historico.js";
import { pastaTemporaria } from "./apoio.js";

function tentativa(extras: Partial<Tentativa> = {}): Tentativa {
  return {
    quando: "2026-10-08T12:00:00.000Z",
    ano: 2023,
    numero: 140,
    idioma: null,
    area: "matematica",
    resposta: "B",
    correta: "B",
    acertou: true,
    ...extras,
  };
}

const errada = (extras: Partial<Tentativa> = {}) => tentativa({ resposta: "C", acertou: false, ...extras });

test("histórico vazio quando o arquivo não existe", async () => {
  const historico = new Historico(join(await pastaTemporaria(), "sub", "historico.jsonl"));
  expect(await historico.ler()).toEqual([]);
});

test("registra e lê de volta na ordem, criando a pasta", async () => {
  const historico = new Historico(join(await pastaTemporaria(), "sub", "historico.jsonl"));
  await historico.registrar(tentativa({ numero: 1 }));
  await historico.registrar(errada({ numero: 2 }));
  const lidas = await historico.ler();
  expect(lidas.map((t) => t.numero)).toEqual([1, 2]);
  expect(lidas[1]?.acertou).toBe(false);
});

test("linhas corrompidas são ignoradas sem perder as boas", async () => {
  const caminho = join(await pastaTemporaria(), "historico.jsonl");
  const historico = new Historico(caminho);
  await historico.registrar(tentativa({ numero: 1 }));
  await appendFile(caminho, '{"quando": "2026', "utf8");
  await appendFile(caminho, '\n{"ano": "texto no lugar de número"}\n\n', "utf8");
  await historico.registrar(tentativa({ numero: 2 }));
  expect((await historico.ler()).map((t) => t.numero)).toEqual([1, 2]);
});

test("desempenho geral e por área", () => {
  const tentativas = [
    tentativa(),
    errada({ numero: 141 }),
    tentativa({ numero: 50, area: "ciencias-humanas" }),
  ];
  const desempenho = calcularDesempenho(tentativas, { agora: new Date("2026-10-08T13:00:00Z") });
  expect(desempenho.geral).toEqual({ total: 3, acertos: 2, percentual: 67 });
  expect(desempenho.porArea.matematica).toEqual({ total: 2, acertos: 1, percentual: 50 });
  expect(desempenho.porArea["ciencias-humanas"]).toEqual({ total: 1, acertos: 1, percentual: 100 });
  expect(desempenho.porArea.linguagens).toBeUndefined();
});

test("desempenho sem tentativas não divide por zero", () => {
  expect(calcularDesempenho([]).geral).toEqual({ total: 0, acertos: 0, percentual: 0 });
});

test("filtra por área e por janela de dias", () => {
  const agora = new Date("2026-10-08T12:00:00Z");
  const tentativas = [
    tentativa({ quando: "2026-09-01T12:00:00.000Z" }),
    errada({ quando: "2026-10-07T12:00:00.000Z", numero: 141 }),
    tentativa({ quando: "2026-10-07T12:00:00.000Z", numero: 50, area: "linguagens" }),
  ];
  expect(calcularDesempenho(tentativas, { area: "matematica", agora }).geral.total).toBe(2);
  expect(calcularDesempenho(tentativas, { dias: 3, agora }).geral.total).toBe(2);
  expect(calcularDesempenho(tentativas, { agora }).ultimos7Dias).toEqual({ total: 2, acertos: 1, percentual: 50 });
});

test("chavesRespondidas distingue idiomas", () => {
  const chaves = chavesRespondidas([tentativa({ numero: 1, idioma: "ingles" }), tentativa({ numero: 140 })]);
  expect([...chaves].sort()).toEqual(["2023-1-ingles", "2023-140-pt"]);
});

test("erros pendentes: só questões erradas, uma entrada por questão", () => {
  const pendentes = errosPendentes([
    tentativa({ numero: 1 }),
    errada({ numero: 2 }),
    errada({ numero: 2 }),
    errada({ numero: 3, ano: 2022 }),
  ]);
  expect(pendentes.map((t) => `${t.ano}-${t.numero}`).sort()).toEqual(["2022-3", "2023-2"]);
});

test("erros pendentes: quem errou e depois acertou não está mais pendente", () => {
  expect(errosPendentes([errada({ numero: 2 }), tentativa({ numero: 2 })])).toEqual([]);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run testes/historico.test.ts
```

Esperado: FALHA, módulos de `../src/historico/` não encontrados.

- [ ] **Passo 3: Implementar `src/historico/historico.ts`**

```ts
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { AREAS, IDIOMAS, LETRAS } from "../enem/tipos.js";
import { log } from "../log.js";

const esquemaDaTentativa = z.object({
  quando: z.string(),
  ano: z.number().int(),
  numero: z.number().int(),
  idioma: z.enum(IDIOMAS).nullable(),
  area: z.enum(AREAS),
  resposta: z.enum(LETRAS),
  correta: z.enum(LETRAS),
  acertou: z.boolean(),
});

export type Tentativa = z.infer<typeof esquemaDaTentativa>;

/** Uma tentativa por linha (JSONL). Só acrescenta: uma queda não estraga o que já foi gravado. */
export class Historico {
  private readonly caminho: string;

  constructor(caminho: string) {
    this.caminho = caminho;
  }

  async registrar(tentativa: Tentativa): Promise<void> {
    await mkdir(dirname(this.caminho), { recursive: true });
    await appendFile(this.caminho, `${JSON.stringify(tentativa)}\n`, "utf8");
  }

  async ler(): Promise<Tentativa[]> {
    let texto: string;
    try {
      texto = await readFile(this.caminho, "utf8");
    } catch {
      return [];
    }
    const tentativas: Tentativa[] = [];
    for (const [indice, linha] of texto.split("\n").entries()) {
      if (linha.trim() === "") continue;
      let bruto: unknown;
      try {
        bruto = JSON.parse(linha);
      } catch {
        log(`linha ${indice + 1} do histórico ignorada: não é JSON`);
        continue;
      }
      const resultado = esquemaDaTentativa.safeParse(bruto);
      if (resultado.success) tentativas.push(resultado.data);
      else log(`linha ${indice + 1} do histórico ignorada: formato inválido`);
    }
    return tentativas;
  }
}
```

- [ ] **Passo 4: Implementar `src/historico/estatisticas.ts` (menos `errosPendentes`)**

```ts
import { AREAS, chaveDaQuestao, type Area } from "../enem/tipos.js";
import type { Tentativa } from "./historico.js";

export interface Placar {
  total: number;
  acertos: number;
  /** De 0 a 100, arredondado. */
  percentual: number;
}

export interface Desempenho {
  geral: Placar;
  porArea: Partial<Record<Area, Placar>>;
  ultimos7Dias: Placar;
}

export interface OpcoesDeDesempenho {
  area?: Area;
  /** Considera só as tentativas dos últimos N dias. */
  dias?: number;
  agora?: Date;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function placar(tentativas: Tentativa[]): Placar {
  const total = tentativas.length;
  const acertos = tentativas.filter((t) => t.acertou).length;
  return { total, acertos, percentual: total === 0 ? 0 : Math.round((acertos / total) * 100) };
}

function dosUltimosDias(tentativas: Tentativa[], dias: number, agora: Date): Tentativa[] {
  const limite = agora.getTime() - dias * MS_POR_DIA;
  return tentativas.filter((t) => {
    const quando = Date.parse(t.quando);
    return !Number.isNaN(quando) && quando >= limite;
  });
}

export function calcularDesempenho(tentativas: Tentativa[], opcoes: OpcoesDeDesempenho = {}): Desempenho {
  const agora = opcoes.agora ?? new Date();
  let consideradas = opcoes.area ? tentativas.filter((t) => t.area === opcoes.area) : tentativas;
  if (opcoes.dias !== undefined) consideradas = dosUltimosDias(consideradas, opcoes.dias, agora);

  const porArea: Partial<Record<Area, Placar>> = {};
  for (const area of AREAS) {
    const daArea = consideradas.filter((t) => t.area === area);
    if (daArea.length > 0) porArea[area] = placar(daArea);
  }
  return { geral: placar(consideradas), porArea, ultimos7Dias: placar(dosUltimosDias(consideradas, 7, agora)) };
}

export function chavesRespondidas(tentativas: Tentativa[]): Set<string> {
  return new Set(tentativas.map(chaveDaQuestao));
}
```

- [ ] **Passo 5: ✍️ Eduardo escreve `errosPendentes`**

Acrescente ao final de `src/historico/estatisticas.ts`:

```ts
/**
 * Devolve uma tentativa para cada questão que o aluno ainda precisa rever.
 * As tentativas chegam na ordem em que aconteceram (a mais antiga primeiro).
 */
export function errosPendentes(tentativas: Tentativa[]): Tentativa[] {
  // Eduardo: sua implementação aqui (5 a 10 linhas).
}
```

A decisão: o que faz um erro deixar de ser pendente? Os testes fixam três
coisas: quem nunca errou não aparece; quem errou e depois acertou não aparece;
cada questão aparece uma vez só. O caso em aberto é **acertou e depois errou**
(o aluno refez e esqueceu). Opções:

- **Vale a última tentativa:** simples, e pega o caso de esquecimento.
- **Basta ter acertado uma vez:** mais generoso; uma vez dominada, sai da
  lista.
- **Precisa acertar mais vezes do que errou:** mais exigente, bom para fixação.

Dica: `chaveDaQuestao(t)` identifica a questão, e um `Map` guarda uma entrada
por chave.

<details>
<summary>Solução de referência (vale a última tentativa)</summary>

```ts
export function errosPendentes(tentativas: Tentativa[]): Tentativa[] {
  const ultimaPorQuestao = new Map<string, Tentativa>();
  for (const tentativa of tentativas) ultimaPorQuestao.set(chaveDaQuestao(tentativa), tentativa);
  return [...ultimaPorQuestao.values()].filter((t) => !t.acertou);
}
```

</details>

- [ ] **Passo 6: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 48 testes passando.

- [ ] **Passo 7: Commit**

```bash
git add src/historico testes/historico.test.ts
git commit -m "Adiciona o histórico de tentativas e as estatísticas"
```

---

### Tarefa 7: Carregador de imagens

**Arquivos:**
- Criar: `src/enem/imagens.ts`
- Teste: `testes/imagens.test.ts`

**Interfaces:**
- Consome: `log`.
- Produz:
  - `interface ImagemCarregada { dados: string; mimeType: string }` (`dados` em base64)
  - `class CarregadorDeImagens`, construtor
    `(pasta: string, opcoes?: { buscar?: typeof fetch; limiteBytes?: number; tempoLimiteMs?: number })`,
    com `carregar(url: string): Promise<ImagemCarregada | null>`. Nunca lança
    erro: qualquer problema devolve `null`.

- [ ] **Passo 1: Escrever os testes que falham**

`testes/imagens.test.ts`:

```ts
import { expect, test } from "vitest";
import { CarregadorDeImagens } from "../src/enem/imagens.js";
import { pastaTemporaria } from "./apoio.js";

function buscadorDe(bytes: number[], status = 200) {
  const chamadas: string[] = [];
  const buscar: typeof fetch = async (entrada) => {
    chamadas.push(String(entrada));
    return new Response(new Uint8Array(bytes), { status });
  };
  return { buscar, chamadas };
}

test("baixa, devolve em base64 e não baixa de novo", async () => {
  const { buscar, chamadas } = buscadorDe([1, 2, 3]);
  const pasta = await pastaTemporaria();
  const carregador = new CarregadorDeImagens(pasta, { buscar });
  const imagem = await carregador.carregar("https://enem.dev/2023/questions/94/figura.png");
  expect(imagem).toEqual({ dados: "AQID", mimeType: "image/png" });

  const outraInstancia = new CarregadorDeImagens(pasta, { buscar });
  expect(await outraInstancia.carregar("https://enem.dev/2023/questions/94/figura.png")).toEqual(imagem);
  expect(chamadas).toHaveLength(1);
});

test("reconhece a extensão em maiúsculas e o tipo jpeg", async () => {
  const carregador = new CarregadorDeImagens(await pastaTemporaria(), { buscar: buscadorDe([9]).buscar });
  expect((await carregador.carregar("https://enem.dev/a/FIGURA.PNG"))?.mimeType).toBe("image/png");
  expect((await carregador.carregar("https://enem.dev/a/foto.jpg"))?.mimeType).toBe("image/jpeg");
});

test("devolve null para o que não deve ser baixado", async () => {
  const { buscar, chamadas } = buscadorDe([1]);
  const carregador = new CarregadorDeImagens(await pastaTemporaria(), { buscar });
  expect(await carregador.carregar("https://enem.dev/broken-image.svg")).toBeNull();
  expect(await carregador.carregar("http://enem.dev/sem-https.png")).toBeNull();
  expect(await carregador.carregar("isto não é uma url")).toBeNull();
  expect(chamadas).toEqual([]);
});

test("devolve null quando o download falha, sem lançar erro", async () => {
  const pasta = await pastaTemporaria();
  const erro404 = new CarregadorDeImagens(pasta, { buscar: buscadorDe([1], 404).buscar });
  expect(await erro404.carregar("https://enem.dev/a.png")).toBeNull();

  const semRede = new CarregadorDeImagens(pasta, {
    buscar: async () => {
      throw new TypeError("fetch failed");
    },
  });
  expect(await semRede.carregar("https://enem.dev/b.png")).toBeNull();
});

test("devolve null para imagem vazia ou grande demais", async () => {
  const pasta = await pastaTemporaria();
  const vazia = new CarregadorDeImagens(pasta, { buscar: buscadorDe([]).buscar });
  expect(await vazia.carregar("https://enem.dev/vazia.png")).toBeNull();
  const grande = new CarregadorDeImagens(pasta, { buscar: buscadorDe([1, 2, 3, 4]).buscar, limiteBytes: 3 });
  expect(await grande.carregar("https://enem.dev/grande.png")).toBeNull();
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run testes/imagens.test.ts
```

Esperado: FALHA, módulo `../src/enem/imagens.js` não encontrado.

- [ ] **Passo 3: Implementar `src/enem/imagens.ts`**

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { log } from "../log.js";

export interface ImagemCarregada {
  /** Conteúdo em base64. */
  dados: string;
  mimeType: string;
}

export interface OpcoesDeImagens {
  buscar?: typeof fetch;
  limiteBytes?: number;
  tempoLimiteMs?: number;
}

const TIPOS_POR_EXTENSAO: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export class CarregadorDeImagens {
  private readonly pasta: string;
  private readonly buscar: typeof fetch;
  private readonly limiteBytes: number;
  private readonly tempoLimiteMs: number;

  constructor(pasta: string, opcoes: OpcoesDeImagens = {}) {
    this.pasta = pasta;
    this.buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
    this.limiteBytes = opcoes.limiteBytes ?? 1_500_000;
    this.tempoLimiteMs = opcoes.tempoLimiteMs ?? 15_000;
  }

  /** Nunca lança erro: uma imagem que falha não pode derrubar a questão. */
  async carregar(url: string): Promise<ImagemCarregada | null> {
    let endereco: URL;
    try {
      endereco = new URL(url);
    } catch {
      return null;
    }
    if (endereco.protocol !== "https:") return null;
    const extensao = extname(endereco.pathname).toLowerCase();
    const mimeType = TIPOS_POR_EXTENSAO[extensao];
    if (!mimeType) return null;

    const nome = createHash("sha256").update(url).digest("hex").slice(0, 32) + extensao;
    const caminho = join(this.pasta, nome);
    try {
      return { dados: (await readFile(caminho)).toString("base64"), mimeType };
    } catch {
      // ainda não está em cache
    }

    try {
      const resposta = await this.buscar(url, { signal: AbortSignal.timeout(this.tempoLimiteMs) });
      if (!resposta.ok) return null;
      const bytes = Buffer.from(await resposta.arrayBuffer());
      if (bytes.length === 0 || bytes.length > this.limiteBytes) return null;
      await mkdir(this.pasta, { recursive: true });
      const temporario = `${caminho}.${process.pid}.tmp`;
      await writeFile(temporario, bytes);
      await rename(temporario, caminho);
      return { dados: bytes.toString("base64"), mimeType };
    } catch (erro) {
      log(`não consegui baixar a imagem ${url}:`, erro);
      return null;
    }
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 53 testes passando.

- [ ] **Passo 5: Commit**

```bash
git add src/enem/imagens.ts testes/imagens.test.ts
git commit -m "Adiciona o carregador de imagens com cache"
```

---

### Tarefa 8: Ferramentas MCP e servidor

**Arquivos:**
- Criar: `src/ferramentas/formatar.ts`, `src/ferramentas/registrar.ts`
- Criar: `src/criar-servidor.ts`, `src/servidor.ts`
- Teste: `testes/ferramentas.test.ts`

**Interfaces:**
- Consome: tudo das tarefas 1 a 7, com as assinaturas listadas em cada uma.
- Produz:
  - `formatarQuestao(q: QuestaoPublica): string`
  - `formatarDesempenho(d: Desempenho): string`
  - `interface Dependencias { repositorio: RepositorioEnem; historico: Historico; imagens: CarregadorDeImagens; aleatorio?: () => number; agora?: () => Date }`
  - `MAXIMO_DE_IMAGENS_POR_RESPOSTA = 8`
  - `registrarFerramentas(servidor: McpServer, dependencias: Dependencias): void`
  - `criarServidor(dependencias: Dependencias): McpServer`
  - Ferramentas MCP: `listar_provas`, `buscar_questoes`, `obter_questao`,
    `corrigir_resposta`, `ver_desempenho`, `revisar_erros`

Notas sobre o SDK (verificadas na versão 1.32.1):

- `servidor.registerTool(nome, { description, inputSchema }, funcao)`, onde
  `inputSchema` é um objeto simples de campos `zod` (não um `z.object`).
- Parâmetro inválido não chega à função: o SDK já responde com
  `isError: true`. `z.config(z.locales.pt())` deixa essa mensagem em português.
- Nos testes, `InMemoryTransport.createLinkedPair()` liga um `Client` ao
  servidor sem processo nem rede.

- [ ] **Passo 1: Escrever os testes que falham**

`testes/ferramentas.test.ts`:

```ts
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { expect, test } from "vitest";
import { criarServidor } from "../src/criar-servidor.js";
import { ClienteApi } from "../src/enem/api.js";
import { CarregadorDeImagens } from "../src/enem/imagens.js";
import { RepositorioEnem } from "../src/enem/repositorio.js";
import { Historico, type Tentativa } from "../src/historico/historico.js";
import { criarApiFalsa, pastaTemporaria, questoesDaProva } from "./apoio.js";

const VAZAMENTO = /gabarito|correctAlternative|isCorrect/i;

async function montar() {
  const pasta = await pastaTemporaria();
  const api = criarApiFalsa([
    {
      ano: 2022,
      idiomas: ["espanhol", "ingles"],
      questoes: questoesDaProva(2022, ["espanhol", "ingles"], { files: ["https://enem.dev/2022/figura.png"] }),
    },
    { ano: 2023, idiomas: ["espanhol", "ingles"], questoes: questoesDaProva(2023) },
  ]);
  let semRede = false;
  const buscar: typeof fetch = async (entrada, init) => {
    if (semRede) throw new TypeError("fetch failed");
    return api.buscar(entrada, init);
  };
  const historico = new Historico(join(pasta, "historico.jsonl"));
  const servidor = criarServidor({
    repositorio: new RepositorioEnem(new ClienteApi({ buscar, intervaloMs: 0 }), join(pasta, "cache")),
    historico,
    imagens: new CarregadorDeImagens(join(pasta, "imagens"), {
      buscar: async () => new Response(new Uint8Array([1, 2, 3])),
    }),
    agora: () => new Date("2026-10-08T12:00:00.000Z"),
  });
  const [ladoDoServidor, ladoDoCliente] = InMemoryTransport.createLinkedPair();
  await servidor.connect(ladoDoServidor);
  const cliente = new Client({ name: "teste", version: "0" });
  await cliente.connect(ladoDoCliente);
  const chamar = async (name: string, argumentos: Record<string, unknown> = {}) =>
    (await cliente.callTool({ name, arguments: argumentos })) as CallToolResult;
  return { cliente, chamar, historico, cortarRede: () => (semRede = true) };
}

function textoDe(resultado: CallToolResult): string {
  return resultado.content.flatMap((bloco) => (bloco.type === "text" ? [bloco.text] : [])).join("\n");
}

function numerosDe(resultado: CallToolResult): number[] {
  return [...textoDe(resultado).matchAll(/· Questão (\d+) ·/g)].map((achado) => Number(achado[1]));
}

function tentativaDeMatematica(numero: number, acertou: boolean): Tentativa {
  return {
    quando: "2026-10-01T12:00:00.000Z",
    ano: 2023,
    numero,
    idioma: null,
    area: "matematica",
    resposta: acertou ? "B" : "C",
    correta: "B",
    acertou,
  };
}

test("oferece as seis ferramentas", async () => {
  const { cliente } = await montar();
  const nomes = (await cliente.listTools()).tools.map((t) => t.name).sort();
  expect(nomes).toEqual([
    "buscar_questoes",
    "corrigir_resposta",
    "listar_provas",
    "obter_questao",
    "revisar_erros",
    "ver_desempenho",
  ]);
});

test("listar_provas mostra anos, áreas e idiomas", async () => {
  const { chamar } = await montar();
  const texto = textoDe(await chamar("listar_provas"));
  expect(texto).toContain("2022");
  expect(texto).toContain("2023");
  expect(texto).toContain("matematica");
  expect(texto).toContain("ingles");
});

test("buscar_questoes devolve a quantidade e a área pedidas, sem o gabarito", async () => {
  const { chamar } = await montar();
  const resultado = await chamar("buscar_questoes", { quantidade: 4, area: "matematica", ano: 2023 });
  expect(resultado.isError).toBeFalsy();
  const numeros = numerosDe(resultado);
  expect(numeros).toHaveLength(4);
  expect(numeros.every((n) => n >= 136 && n <= 180)).toBe(true);
  expect(textoDe(resultado)).toContain("Matemática e suas Tecnologias");
  expect(JSON.stringify(resultado)).not.toMatch(VAZAMENTO);
});

test("buscar_questoes sem parâmetros usa os padrões (5 questões)", async () => {
  const { chamar } = await montar();
  expect(numerosDe(await chamar("buscar_questoes"))).toHaveLength(5);
});

test("obter_questao respeita o idioma e não mostra o gabarito", async () => {
  const { chamar } = await montar();
  const emEspanhol = await chamar("obter_questao", { ano: 2023, numero: 1, idioma: "espanhol" });
  expect(textoDe(emEspanhol)).toContain("Língua estrangeira: espanhol");
  const padrao = await chamar("obter_questao", { ano: 2023, numero: 1 });
  expect(textoDe(padrao)).toContain("Língua estrangeira: inglês");
  expect(JSON.stringify(emEspanhol)).not.toMatch(VAZAMENTO);
});

test("corrigir_resposta aceita letra minúscula, revela o gabarito e grava", async () => {
  const { chamar, historico } = await montar();
  const certa = await chamar("corrigir_resposta", { ano: 2023, numero: 140, resposta: "b" });
  expect(textoDe(certa)).toContain("Resposta correta");
  expect(textoDe(certa)).toContain("B) Alternativa B");

  const errada = await chamar("corrigir_resposta", { ano: 2023, numero: 141, resposta: "C" });
  expect(textoDe(errada)).toContain("Resposta incorreta");
  expect(textoDe(errada)).toContain("B) Alternativa B");

  expect(await historico.ler()).toEqual([
    { quando: "2026-10-08T12:00:00.000Z", ano: 2023, numero: 140, idioma: null, area: "matematica", resposta: "B", correta: "B", acertou: true },
    { quando: "2026-10-08T12:00:00.000Z", ano: 2023, numero: 141, idioma: null, area: "matematica", resposta: "C", correta: "B", acertou: false },
  ]);
});

test("responder a mesma questão duas vezes grava as duas tentativas", async () => {
  const { chamar, historico } = await montar();
  await chamar("corrigir_resposta", { ano: 2023, numero: 140, resposta: "A" });
  await chamar("corrigir_resposta", { ano: 2023, numero: 140, resposta: "B" });
  expect((await historico.ler()).map((t) => t.acertou)).toEqual([false, true]);
});

test("pedir mais inéditas do que existem devolve as que houver, com aviso", async () => {
  const { chamar, historico } = await montar();
  for (let numero = 136; numero <= 177; numero++) await historico.registrar(tentativaDeMatematica(numero, true));
  const resultado = await chamar("buscar_questoes", { quantidade: 20, area: "matematica", ano: 2023 });
  expect(resultado.isError).toBeFalsy();
  expect(numerosDe(resultado).sort()).toEqual([178, 179, 180]);
  expect(textoDe(resultado)).toContain("3 de 20");
});

test("quando não sobra nenhuma questão, explica em vez de dar erro", async () => {
  const { chamar, historico } = await montar();
  for (let numero = 136; numero <= 180; numero++) await historico.registrar(tentativaDeMatematica(numero, true));
  const resultado = await chamar("buscar_questoes", { area: "matematica", ano: 2023 });
  expect(resultado.isError).toBeFalsy();
  expect(numerosDe(resultado)).toEqual([]);
  expect(textoDe(resultado)).toContain("ineditas");

  const repetindo = await chamar("buscar_questoes", { area: "matematica", ano: 2023, ineditas: false });
  expect(numerosDe(repetindo)).toHaveLength(5);
});

test("sem internet, o sorteio sem ano usa uma prova já baixada", async () => {
  const { chamar, cortarRede } = await montar();
  await chamar("buscar_questoes", { ano: 2023, quantidade: 1 });
  cortarRede();
  for (let vez = 0; vez < 5; vez++) {
    const resultado = await chamar("buscar_questoes", { quantidade: 2, ineditas: false });
    expect(resultado.isError).toBeFalsy();
    expect(textoDe(resultado)).toContain("ENEM 2023");
    expect(textoDe(resultado)).not.toContain("ENEM 2022");
  }
});

test("sem internet e sem cache, o erro é claro e em português", async () => {
  const { chamar, cortarRede } = await montar();
  cortarRede();
  const resultado = await chamar("buscar_questoes");
  expect(resultado.isError).toBe(true);
  expect(textoDe(resultado)).toContain("Não consegui falar com a API do ENEM");
});

test("anexa no máximo 8 imagens e avisa das que ficaram só como link", async () => {
  const { chamar } = await montar();
  const resultado = await chamar("buscar_questoes", { quantidade: 12, ano: 2022, area: "matematica" });
  expect(numerosDe(resultado)).toHaveLength(12);
  const imagens = resultado.content.filter((bloco) => bloco.type === "image");
  expect(imagens).toHaveLength(8);
  expect(imagens[0]).toMatchObject({ type: "image", data: "AQID", mimeType: "image/png" });
  expect(textoDe(resultado)).toContain("4 imagem(ns)");
  expect(textoDe(resultado)).toContain("https://enem.dev/2022/figura.png");
});

test("apenas_texto não devolve questões com imagem", async () => {
  const { chamar } = await montar();
  const resultado = await chamar("buscar_questoes", { ano: 2022, apenas_texto: true });
  expect(resultado.isError).toBeFalsy();
  expect(numerosDe(resultado)).toEqual([]);
  expect(resultado.content.some((bloco) => bloco.type === "image")).toBe(false);
});

test("ano inexistente e questão anulada dão erro explicando", async () => {
  const { chamar } = await montar();
  const semProva = await chamar("buscar_questoes", { ano: 2010 });
  expect(semProva.isError).toBe(true);
  expect(textoDe(semProva)).toContain("2022, 2023");

  const anulada = await chamar("obter_questao", { ano: 2023, numero: 34 });
  expect(anulada.isError).toBe(true);
  expect(textoDe(anulada)).toContain("anulada");
});

test("parâmetro inválido é recusado com mensagem em português", async () => {
  const { chamar } = await montar();
  const resultado = await chamar("buscar_questoes", { quantidade: 99 });
  expect(resultado.isError).toBe(true);
  expect(textoDe(resultado)).toContain("20");
  expect(textoDe(resultado)).not.toContain("Too big");

  const letra = await chamar("corrigir_resposta", { ano: 2023, numero: 140, resposta: "Z" });
  expect(letra.isError).toBe(true);
});

test("ver_desempenho sem histórico e com histórico", async () => {
  const { chamar } = await montar();
  expect(textoDe(await chamar("ver_desempenho"))).toContain("ainda não respondeu");

  await chamar("corrigir_resposta", { ano: 2023, numero: 140, resposta: "B" });
  await chamar("corrigir_resposta", { ano: 2023, numero: 141, resposta: "C" });
  await chamar("corrigir_resposta", { ano: 2023, numero: 50, resposta: "B" });
  const texto = textoDe(await chamar("ver_desempenho"));
  expect(texto).toContain("Geral: 2 de 3 (67%)");
  expect(texto).toContain("Matemática e suas Tecnologias: 1 de 2 (50%)");

  const soHumanas = textoDe(await chamar("ver_desempenho", { area: "ciencias-humanas" }));
  expect(soHumanas).toContain("Geral: 1 de 1 (100%)");
});

test("revisar_erros devolve a questão errada sem gabarito, e ela some depois do acerto", async () => {
  const { chamar } = await montar();
  expect(textoDe(await chamar("revisar_erros"))).toContain("Nenhum erro pendente");

  await chamar("corrigir_resposta", { ano: 2023, numero: 141, resposta: "C" });
  await chamar("corrigir_resposta", { ano: 2023, numero: 150, resposta: "B" });
  const revisao = await chamar("revisar_erros");
  expect(numerosDe(revisao)).toEqual([141]);
  expect(JSON.stringify(revisao)).not.toMatch(VAZAMENTO);

  await chamar("corrigir_resposta", { ano: 2023, numero: 141, resposta: "B" });
  expect(textoDe(await chamar("revisar_erros"))).toContain("Nenhum erro pendente");
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run testes/ferramentas.test.ts
```

Esperado: FALHA, módulo `../src/criar-servidor.js` não encontrado.

- [ ] **Passo 3: Implementar `src/ferramentas/formatar.ts`**

```ts
import { AREAS, NOMES_DAS_AREAS, type Idioma, type QuestaoPublica } from "../enem/tipos.js";
import type { Desempenho, Placar } from "../historico/estatisticas.js";

const NOMES_DOS_IDIOMAS: Record<Idioma, string> = { ingles: "inglês", espanhol: "espanhol" };

export function formatarQuestao(questao: QuestaoPublica): string {
  const linhas = [`## ENEM ${questao.ano} · Questão ${questao.numero} · ${NOMES_DAS_AREAS[questao.area]}`];
  if (questao.idioma) linhas.push(`Língua estrangeira: ${NOMES_DOS_IDIOMAS[questao.idioma]}`);
  if (questao.contexto) linhas.push("", questao.contexto);
  if (questao.enunciado) linhas.push("", questao.enunciado);
  linhas.push("");
  for (const alternativa of questao.alternativas) {
    const imagem = alternativa.imagem ? ` [imagem](${alternativa.imagem})` : "";
    linhas.push(`${alternativa.letra}) ${alternativa.texto ?? ""}${imagem}`.trimEnd());
  }
  if (questao.imagens.length > 0) linhas.push("", `Imagens da questão: ${questao.imagens.join(" ")}`);
  return linhas.join("\n");
}

export function formatarDesempenho(desempenho: Desempenho): string {
  const linha = (rotulo: string, placar: Placar) =>
    `- ${rotulo}: ${placar.acertos} de ${placar.total} (${placar.percentual}%)`;
  const linhas = [
    "## Desempenho",
    linha("Geral", desempenho.geral),
    linha("Últimos 7 dias", desempenho.ultimos7Dias),
    "",
    "### Por área",
  ];
  for (const area of AREAS) {
    const placar = desempenho.porArea[area];
    if (placar) linhas.push(linha(NOMES_DAS_AREAS[area], placar));
  }
  return linhas.join("\n");
}
```

- [ ] **Passo 4: Implementar `src/ferramentas/registrar.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CarregadorDeImagens } from "../enem/imagens.js";
import type { RepositorioEnem } from "../enem/repositorio.js";
import { AREAS, ErroEnem, IDIOMAS, LETRAS, paraPublica, type Questao, type QuestaoPublica } from "../enem/tipos.js";
import { calcularDesempenho, chavesRespondidas, errosPendentes } from "../historico/estatisticas.js";
import type { Historico } from "../historico/historico.js";
import { log } from "../log.js";
import { formatarDesempenho, formatarQuestao } from "./formatar.js";
import { escolherAno, filtrar, sortear } from "./sorteio.js";

// Mensagens de validação do zod em português.
z.config(z.locales.pt());

export interface Dependencias {
  repositorio: RepositorioEnem;
  historico: Historico;
  imagens: CarregadorDeImagens;
  aleatorio?: () => number;
  agora?: () => Date;
}

/** Acima disso a resposta fica grande demais para o modelo. */
export const MAXIMO_DE_IMAGENS_POR_RESPOSTA = 8;

type Bloco = CallToolResult["content"][number];

const campoAno = z.number().int().min(2009).describe("Ano da prova, por exemplo 2023.");
const campoNumero = z.number().int().min(1).max(200).describe("Número da questão na prova.");
const campoArea = z.enum(AREAS).describe("Área do conhecimento.");
const campoIdioma = z
  .enum(IDIOMAS)
  .describe("Idioma das questões de língua estrangeira. Só afeta essas questões.");

function texto(mensagem: string): CallToolResult {
  return { content: [{ type: "text", text: mensagem }] };
}

function falha(mensagem: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: mensagem }] };
}

async function protegido(acao: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof ErroEnem) return falha(erro.message);
    log("erro inesperado:", erro);
    return falha("Ocorreu um erro inesperado no mcp-enem. Tente de novo.");
  }
}

function enderecosDasImagens(questao: QuestaoPublica): string[] {
  return [...questao.imagens, ...questao.alternativas.flatMap((a) => (a.imagem ? [a.imagem] : []))];
}

async function montarQuestoes(
  questoes: QuestaoPublica[],
  imagens: CarregadorDeImagens,
  avisos: string[],
): Promise<CallToolResult> {
  const blocos: Bloco[] = [];
  let anexadas = 0;
  let semAnexo = 0;
  for (const questao of questoes) {
    blocos.push({ type: "text", text: formatarQuestao(questao) });
    for (const endereco of enderecosDasImagens(questao)) {
      const imagem = anexadas < MAXIMO_DE_IMAGENS_POR_RESPOSTA ? await imagens.carregar(endereco) : null;
      if (imagem) {
        blocos.push({ type: "image", data: imagem.dados, mimeType: imagem.mimeType });
        anexadas++;
      } else {
        semAnexo++;
      }
    }
  }
  const todos = [...avisos];
  if (semAnexo > 0) todos.push(`${semAnexo} imagem(ns) não foram anexadas; use os links no texto da questão.`);
  if (todos.length > 0) blocos.push({ type: "text", text: `Avisos:\n${todos.map((a) => `- ${a}`).join("\n")}` });
  return { content: blocos };
}

export function registrarFerramentas(servidor: McpServer, dependencias: Dependencias): void {
  const { repositorio, historico, imagens } = dependencias;
  const aleatorio = dependencias.aleatorio ?? Math.random;
  const agora = dependencias.agora ?? (() => new Date());

  servidor.registerTool(
    "listar_provas",
    { description: "Lista os anos de prova do ENEM disponíveis, as áreas do conhecimento e os idiomas." },
    async () =>
      protegido(async () => {
        const provas = await repositorio.listarProvas();
        const anos = provas.map((p) => p.ano);
        return texto(
          [
            `Provas disponíveis: ${anos.join(", ")}.`,
            `Áreas (parâmetro "area"): ${AREAS.join(", ")}.`,
            `Idiomas das questões de língua estrangeira (parâmetro "idioma"): ${IDIOMAS.join(", ")}.`,
          ].join("\n"),
        );
      }),
  );

  servidor.registerTool(
    "buscar_questoes",
    {
      description:
        "Sorteia questões oficiais do ENEM para o aluno responder. A resposta certa NÃO é devolvida: " +
        "depois que o aluno responder, use corrigir_resposta. Apresente uma questão por vez.",
      inputSchema: {
        quantidade: z.number().int().min(1).max(20).default(5).describe("Quantas questões sortear (1 a 20)."),
        area: campoArea.optional(),
        ano: campoAno.optional().describe("Ano da prova. Se omitido, um ano é sorteado."),
        idioma: campoIdioma.default("ingles"),
        apenas_texto: z.boolean().default(false).describe("Se verdadeiro, pula questões que têm imagem."),
        ineditas: z.boolean().default(true).describe("Se verdadeiro, evita questões que o aluno já respondeu."),
      },
    },
    async ({ quantidade, area, ano, idioma, apenas_texto, ineditas }) =>
      protegido(async () => {
        const avisos: string[] = [];
        const excluir = ineditas ? chavesRespondidas(await historico.ler()) : new Set<string>();

        let anoEscolhido: number;
        let questoes: Questao[];
        if (ano !== undefined) {
          anoEscolhido = ano;
          questoes = await repositorio.questoesDoAno(anoEscolhido);
        } else {
          const emCache = await repositorio.anosEmCache();
          anoEscolhido = escolherAno(await repositorio.anosDisponiveis(), emCache, aleatorio);
          try {
            questoes = await repositorio.questoesDoAno(anoEscolhido);
          } catch (erro) {
            // Sem rede para baixar um ano novo: usa um que já esteja em cache.
            const reserva = sortear(emCache, 1, aleatorio)[0];
            if (!(erro instanceof ErroEnem) || erro.codigo === "nao_encontrado" || reserva === undefined) throw erro;
            anoEscolhido = reserva;
            questoes = await repositorio.questoesDoAno(anoEscolhido);
            avisos.push("Não consegui baixar uma prova nova; usei uma que já estava guardada.");
          }
        }

        const candidatas = filtrar(questoes, { area, idioma, apenasTexto: apenas_texto, excluir });
        const escolhidas = sortear(candidatas, quantidade, aleatorio).sort((a, b) => a.numero - b.numero);
        if (escolhidas.length === 0) {
          return texto(
            `Não há questões do ENEM ${anoEscolhido} com esses filtros. ` +
              "Tente outro ano ou outra área, ou use ineditas=false para repetir questões já respondidas.",
          );
        }
        if (escolhidas.length < quantidade) {
          avisos.push(`Só havia ${escolhidas.length} de ${quantidade} questões com esses filtros no ENEM ${anoEscolhido}.`);
        }
        return montarQuestoes(escolhidas.map(paraPublica), imagens, avisos);
      }),
  );

  servidor.registerTool(
    "obter_questao",
    {
      description:
        "Devolve uma questão específica do ENEM pelo ano e número, sem a resposta certa. " +
        "Use corrigir_resposta depois que o aluno responder.",
      inputSchema: { ano: campoAno, numero: campoNumero, idioma: campoIdioma.optional() },
    },
    async ({ ano, numero, idioma }) =>
      protegido(async () => {
        const questao = await repositorio.obterQuestao(ano, numero, idioma);
        return montarQuestoes([paraPublica(questao)], imagens, []);
      }),
  );

  servidor.registerTool(
    "corrigir_resposta",
    {
      description:
        "Confere a resposta do aluno com o gabarito oficial, revela a alternativa correta e registra a " +
        "tentativa no histórico. Chame só depois que o aluno tiver escolhido uma alternativa.",
      inputSchema: {
        ano: campoAno,
        numero: campoNumero,
        resposta: z
          .enum(["A", "B", "C", "D", "E", "a", "b", "c", "d", "e"])
          .describe("A alternativa que o aluno escolheu, de A a E."),
        idioma: campoIdioma.optional(),
      },
    },
    async ({ ano, numero, resposta, idioma }) =>
      protegido(async () => {
        const questao = await repositorio.obterQuestao(ano, numero, idioma);
        const marcada = LETRAS.find((letra) => letra === resposta.toUpperCase());
        if (!marcada) return falha("A resposta deve ser uma letra de A a E.");
        const acertou = marcada === questao.gabarito;
        await historico.registrar({
          quando: agora().toISOString(),
          ano: questao.ano,
          numero: questao.numero,
          idioma: questao.idioma,
          area: questao.area,
          resposta: marcada,
          correta: questao.gabarito,
          acertou,
        });
        const correta = questao.alternativas.find((a) => a.letra === questao.gabarito);
        const gabarito = `${questao.gabarito}) ${correta?.texto ?? "(alternativa em imagem)"}`;
        return texto(
          acertou
            ? `Resposta correta. Gabarito oficial: ${gabarito}`
            : `Resposta incorreta. O aluno marcou ${marcada}. Gabarito oficial: ${gabarito}`,
        );
      }),
  );

  servidor.registerTool(
    "ver_desempenho",
    {
      description: "Mostra os acertos e erros do aluno, no geral, nos últimos 7 dias e por área do conhecimento.",
      inputSchema: {
        area: campoArea.optional(),
        dias: z.number().int().min(1).max(3650).optional().describe("Considera só os últimos N dias."),
      },
    },
    async ({ area, dias }) =>
      protegido(async () => {
        const tentativas = await historico.ler();
        if (tentativas.length === 0) {
          return texto("O aluno ainda não respondeu nenhuma questão. Use buscar_questoes para começar.");
        }
        return texto(formatarDesempenho(calcularDesempenho(tentativas, { area, dias, agora: agora() })));
      }),
  );

  servidor.registerTool(
    "revisar_erros",
    {
      description:
        "Devolve questões que o aluno errou e ainda precisa rever, sem a resposta certa, para ele tentar de novo. " +
        "Use corrigir_resposta depois que ele responder.",
      inputSchema: {
        quantidade: z.number().int().min(1).max(20).default(5).describe("Quantas questões devolver (1 a 20)."),
        area: campoArea.optional(),
      },
    },
    async ({ quantidade, area }) =>
      protegido(async () => {
        const pendentes = errosPendentes(await historico.ler()).filter((t) => area === undefined || t.area === area);
        const questoes: QuestaoPublica[] = [];
        for (const pendente of pendentes.slice(0, quantidade)) {
          try {
            const questao = await repositorio.obterQuestao(pendente.ano, pendente.numero, pendente.idioma ?? undefined);
            questoes.push(paraPublica(questao));
          } catch (erro) {
            if (!(erro instanceof ErroEnem)) throw erro;
            log(`não consegui recarregar a questão ${pendente.numero} de ${pendente.ano}: ${erro.message}`);
          }
        }
        if (questoes.length === 0) return texto("Nenhum erro pendente para rever.");
        return montarQuestoes(questoes, imagens, []);
      }),
  );
}
```

- [ ] **Passo 5: Implementar `src/criar-servidor.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registrarFerramentas, type Dependencias } from "./ferramentas/registrar.js";
import { VERSAO } from "./versao.js";

export function criarServidor(dependencias: Dependencias): McpServer {
  const servidor = new McpServer({ name: "mcp-enem", version: VERSAO });
  registrarFerramentas(servidor, dependencias);
  return servidor;
}
```

- [ ] **Passo 6: Implementar `src/servidor.ts`**

```ts
#!/usr/bin/env node
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { diretorioDeDados } from "./config.js";
import { criarServidor } from "./criar-servidor.js";
import { ClienteApi } from "./enem/api.js";
import { CarregadorDeImagens } from "./enem/imagens.js";
import { RepositorioEnem } from "./enem/repositorio.js";
import { Historico } from "./historico/historico.js";
import { log } from "./log.js";

const pasta = diretorioDeDados();
const servidor = criarServidor({
  repositorio: new RepositorioEnem(new ClienteApi(), join(pasta, "cache")),
  historico: new Historico(join(pasta, "historico.jsonl")),
  imagens: new CarregadorDeImagens(join(pasta, "cache", "imagens")),
});

await servidor.connect(new StdioServerTransport());
log(`servidor iniciado; dados em ${pasta}`);
```

- [ ] **Passo 7: Rodar e ver passar**

```bash
npm run verificar
```

Esperado: 70 testes passando, sem erros de tipo.

- [ ] **Passo 8: Conferir que nada escreve no stdout**

```bash
grep -rn "console.log\|process.stdout" src
```

Esperado: nenhuma linha.

- [ ] **Passo 9: Commit**

```bash
git add src testes/ferramentas.test.ts
git commit -m "Adiciona as seis ferramentas MCP e o servidor"
```

---

### Tarefa 9: Empacotamento, README e teste manual

**Arquivos:**
- Modificar: `README.md`, `docs/especificacao.md` (seção "Pontos em aberto")
- Usa: `dist/` gerado pelo build

**Interfaces:**
- Consome: `dist/servidor.js` (tarefa 8).
- Produz: instruções de instalação e o resultado do teste manual.

- [ ] **Passo 1: Gerar o build e conferir o que foi gerado**

```bash
npm run build
```

```bash
head -1 dist/servidor.js && ls dist
```

Esperado: a primeira linha é `#!/usr/bin/env node`; `dist/` tem `servidor.js`,
`criar-servidor.js`, `enem/`, `historico/`, `ferramentas/` e nenhum arquivo de
teste.

- [ ] **Passo 2: Teste de fumaça pelo protocolo de verdade**

Envia um `initialize` pelo stdin e confere que a resposta é JSON puro:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"fumaca","version":"0"}}}' | MCP_ENEM_DIR=/tmp/mcp-enem-fumaca node dist/servidor.js 2>/dev/null | head -1
```

Esperado: uma linha JSON que começa com `{"result":{` ou `{"jsonrpc":"2.0"` e
contém `"name":"mcp-enem"`. Qualquer texto que não seja JSON no stdout é um
defeito a corrigir antes de seguir.

- [ ] **Passo 3: Conferir o conteúdo do pacote**

```bash
npm pack --dry-run
```

Esperado: a lista traz `dist/`, `README.md`, `LICENSE` e `package.json`; não
traz `src/`, `testes/` nem `docs/`.

- [ ] **Passo 4: Conectar no Claude Code e fazer uma sessão real**

```bash
claude mcp add mcp-enem -- node "$(pwd)/dist/servidor.js"
```

Numa conversa nova, faça este roteiro e anote o resultado de cada item:

1. "Quais provas do ENEM você tem?" → chama `listar_provas`, mostra 2009 a 2023.
2. "Me dá 3 questões de matemática de 2023." → três questões, sem gabarito.
   **Anote se as imagens aparecem para você na conversa.**
3. Responda uma certa e uma errada. → corrige e explica.
4. "Como estou indo?" → mostra o placar.
5. "Quero refazer o que errei." → traz a questão errada.
6. Desligue a internet e peça mais questões. → usa a prova já baixada.

- [ ] **Passo 5: Registrar o resultado das imagens na especificação**

Em `docs/especificacao.md`, substitua o item 1 de "Pontos em aberto" pelo que
foi observado no passo 4. Se o aluno **não** vê as imagens na conversa, mude em
`src/ferramentas/registrar.ts` o padrão de `apenas_texto` para `true`, ajuste
no teste "buscar_questoes sem parâmetros" o ano para `2023`, rode
`npm run verificar` e descreva a mudança na especificação.

- [ ] **Passo 6: Reescrever o `README.md`**

````markdown
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

Precisa do [Node.js](https://nodejs.org) 20 ou superior.

**Claude Code**

```bash
claude mcp add mcp-enem -- npx -y mcp-enem
```

**Claude Desktop**

Em Configurações → Desenvolvedor → Editar configuração, acrescente:

```json
{
  "mcpServers": {
    "mcp-enem": {
      "command": "npx",
      "args": ["-y", "mcp-enem"]
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
````

Se o pacote ainda não tiver sido publicado no npm (passo 8), troque os dois
`npx -y mcp-enem` por `node /caminho/para/mcp-enem/dist/servidor.js` e
acrescente antes uma linha dizendo para clonar o repositório e rodar
`npm install && npm run build`.

- [ ] **Passo 7: Commit e push**

```bash
git add README.md docs/especificacao.md src testes
git commit -m "Documenta a instalação e registra o teste manual"
git push
```

- [ ] **Passo 8: Publicar no npm (só com o ok explícito do Eduardo)**

Publicar é público e não dá para desfazer por completo. Não execute sem o
Eduardo pedir. Ele precisa ter conta no npm e rodar `npm login` por conta
própria. Depois:

```bash
npm publish --access public
```

Esperado: `+ mcp-enem@0.1.0`. Em seguida, confira com
`npx -y mcp-enem < /dev/null` que o pacote baixa e inicia.

---

## Revisão do plano contra a especificação

| Item da especificação | Tarefa |
|---|---|
| Três módulos (`enem/`, `historico/`, `ferramentas/`) | 3, 4, 6, 7, 8 |
| Dados em `~/.mcp-enem/` ou `MCP_ENEM_DIR` | 1, 8 |
| Seis ferramentas com os parâmetros descritos | 8 |
| Gabarito só em `corrigir_resposta` | 1 (`paraPublica`), 8 (testes de vazamento) |
| Cache de um ano inteiro, baixado uma vez | 4 |
| Limite de 10 req/10 s e resposta 429 | 3 |
| API fora do ar: usa o cache, mensagem clara | 3, 4, 8 |
| Ano ou questão inexistente | 4, 8 |
| Parâmetro inválido em português | 8 |
| Imagem quebrada pulada no sorteio | 3 (`incompleta`), 5 |
| Falha ao baixar imagem: só o link e um aviso | 7, 8 |
| Questões de língua estrangeira em dobro | 3, 4, 5 |
| Nada no stdout | 1 (`log`), 8 (passo 8), 9 (passo 2) |
| Gravação atômica e histórico só com acréscimo | 2, 6 |
| Linha corrompida no histórico | 6 |
| Cache corrompido | 2, 4 |
| Testes sem rede | `testes/apoio.ts` (2, 3) |
| Distribuição por `npx` | 9 |
| Exibição de imagens (ponto em aberto) | 9, passos 4 e 5 |
