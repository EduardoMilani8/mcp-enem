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

interface OpcoesDeMontagem {
  aleatorio?: () => number;
  buscarImagem?: typeof fetch;
  prazoDasImagensMs?: number;
}

async function montar(opcoes: OpcoesDeMontagem = {}) {
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
      buscar: opcoes.buscarImagem ?? (async () => new Response(new Uint8Array([1, 2, 3]))),
    }),
    agora: () => new Date("2026-10-08T12:00:00.000Z"),
    aleatorio: opcoes.aleatorio,
    prazoDasImagensMs: opcoes.prazoDasImagensMs,
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

test("corrigir_resposta exige o idioma quando a questão existe em mais de um", async () => {
  const { chamar, historico } = await montar();
  const semIdioma = await chamar("corrigir_resposta", { ano: 2023, numero: 3, resposta: "B" });
  expect(semIdioma.isError).toBe(true);
  expect(textoDe(semIdioma)).toContain("idioma");
  expect(await historico.ler()).toEqual([]);
});

test("corrigir_resposta confere contra a questão do idioma informado", async () => {
  const { chamar, historico } = await montar();
  const espanhol = await chamar("corrigir_resposta", { ano: 2023, numero: 3, resposta: "B", idioma: "espanhol" });
  expect(textoDe(espanhol)).toContain("Resposta correta");
  expect(textoDe(espanhol)).toContain("espanhol");

  const ingles = await chamar("corrigir_resposta", { ano: 2023, numero: 3, resposta: "B", idioma: "ingles" });
  expect(textoDe(ingles)).toContain("Resposta incorreta");
  expect(textoDe(ingles)).toContain("C) Alternativa C");

  expect((await historico.ler()).map((t) => [t.idioma, t.acertou])).toEqual([
    ["espanhol", true],
    ["ingles", false],
  ]);
});

test("sem ano, completa com outras provas quando a primeira já foi toda respondida", async () => {
  // aleatorio fixo em 0 faz o sorteio começar sempre pela prova já baixada.
  const { chamar, historico } = await montar({ aleatorio: () => 0 });
  await chamar("buscar_questoes", { ano: 2023, quantidade: 1, area: "linguagens" });
  for (let numero = 136; numero <= 180; numero++) await historico.registrar(tentativaDeMatematica(numero, true));

  const resultado = await chamar("buscar_questoes", { area: "matematica", quantidade: 5 });
  expect(resultado.isError).toBeFalsy();
  expect(numerosDe(resultado)).toHaveLength(5);
  expect(textoDe(resultado)).toContain("ENEM 2022");
  expect(textoDe(resultado)).not.toContain("ENEM 2023");
});

test("sem ano, junta questões de mais de uma prova para completar a quantidade", async () => {
  const { chamar, historico } = await montar({ aleatorio: () => 0 });
  await chamar("buscar_questoes", { ano: 2023, quantidade: 1, area: "linguagens" });
  for (let numero = 136; numero <= 177; numero++) await historico.registrar(tentativaDeMatematica(numero, true));

  const resultado = await chamar("buscar_questoes", { area: "matematica", quantidade: 5, apenas_texto: false });
  expect(numerosDe(resultado)).toHaveLength(5);
  expect(textoDe(resultado).match(/ENEM 2023 · Questão/g)).toHaveLength(3);
  expect(textoDe(resultado).match(/ENEM 2022 · Questão/g)).toHaveLength(2);
});

test("com o servidor de imagens fora do ar, tenta no máximo 8 downloads", async () => {
  let tentativas = 0;
  const { chamar } = await montar({
    buscarImagem: async () => {
      tentativas++;
      return new Response("", { status: 404 });
    },
  });
  const resultado = await chamar("buscar_questoes", { quantidade: 20, ano: 2022, area: "matematica" });
  expect(numerosDe(resultado)).toHaveLength(20);
  expect(resultado.content.some((bloco) => bloco.type === "image")).toBe(false);
  expect(tentativas).toBeLessThanOrEqual(8);
  expect(textoDe(resultado)).toContain("20 imagem(ns)");
});

test("imagem que demora demais não segura a resposta", async () => {
  const { chamar } = await montar({
    buscarImagem: () => new Promise<Response>(() => {}),
    prazoDasImagensMs: 30,
  });
  const resultado = await chamar("buscar_questoes", { quantidade: 3, ano: 2022, area: "matematica" });
  expect(numerosDe(resultado)).toHaveLength(3);
  expect(resultado.content.some((bloco) => bloco.type === "image")).toBe(false);
  expect(textoDe(resultado)).toContain("https://enem.dev/2022/figura.png");
}, 2000);

test("o total de imagens anexadas respeita um teto de tamanho", async () => {
  const grande = new Uint8Array(600_000).fill(7);
  const { chamar } = await montar({ buscarImagem: async () => new Response(grande) });
  const resultado = await chamar("buscar_questoes", { quantidade: 8, ano: 2022, area: "matematica" });
  expect(numerosDe(resultado)).toHaveLength(8);
  const anexadas = resultado.content.flatMap((bloco) => (bloco.type === "image" ? [bloco.data.length] : []));
  expect(anexadas.length).toBeGreaterThan(0);
  expect(anexadas.reduce((soma, tamanho) => soma + tamanho, 0)).toBeLessThanOrEqual(3_000_000);
  expect(textoDe(resultado)).toContain("imagem(ns) não foram anexadas");
});
