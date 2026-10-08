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
