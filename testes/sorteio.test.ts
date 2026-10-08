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
