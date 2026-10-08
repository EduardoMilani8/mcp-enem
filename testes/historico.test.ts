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
