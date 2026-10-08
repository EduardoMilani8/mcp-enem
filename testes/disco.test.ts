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
