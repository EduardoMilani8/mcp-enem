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

test("pedidos simultâneos do mesmo ano fazem um único download", async () => {
  const api = apiPadrao();
  const pasta = await pastaTemporaria();
  const sozinho = new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), pasta);
  await sozinho.questoesDoAno(2023);
  const chamadasDeUmDownload = api.chamadas.length;

  const outraApi = apiPadrao();
  const repositorio = new RepositorioEnem(new ClienteApi({ buscar: outraApi.buscar, intervaloMs: 0 }), await pastaTemporaria());
  const resultados = await Promise.all([
    repositorio.questoesDoAno(2023),
    repositorio.questoesDoAno(2023),
    repositorio.obterQuestao(2023, 140),
  ]);
  expect(resultados[0]).toHaveLength(184);
  expect(resultados[1]).toHaveLength(184);
  expect(resultados[2].numero).toBe(140);
  expect(outraApi.chamadas.length).toBe(chamadasDeUmDownload);
});

test("um download que falha não fica preso: a tentativa seguinte funciona", async () => {
  const api = apiPadrao();
  let falhar = true;
  const buscar: typeof fetch = async (entrada, init) => {
    if (falhar) throw new TypeError("fetch failed");
    return api.buscar(entrada, init);
  };
  const repositorio = new RepositorioEnem(new ClienteApi({ buscar, intervaloMs: 0 }), await pastaTemporaria());
  await expect(repositorio.questoesDoAno(2023)).rejects.toMatchObject({ codigo: "indisponivel" });
  falhar = false;
  expect(await repositorio.questoesDoAno(2023)).toHaveLength(184);
});
