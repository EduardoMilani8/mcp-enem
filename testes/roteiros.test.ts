import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { criarServidor } from "../src/criar-servidor.js";
import { ClienteApi } from "../src/enem/api.js";
import { CarregadorDeImagens } from "../src/enem/imagens.js";
import { RepositorioEnem } from "../src/enem/repositorio.js";
import { Historico } from "../src/historico/historico.js";
import { criarApiFalsa, pastaTemporaria } from "./apoio.js";

async function conectar(): Promise<Client> {
  const pasta = await pastaTemporaria();
  const api = criarApiFalsa([]);
  const servidor = criarServidor({
    repositorio: new RepositorioEnem(new ClienteApi({ buscar: api.buscar, intervaloMs: 0 }), join(pasta, "cache")),
    historico: new Historico(join(pasta, "historico.jsonl")),
    imagens: new CarregadorDeImagens(join(pasta, "imagens")),
  });
  const [ladoDoServidor, ladoDoCliente] = InMemoryTransport.createLinkedPair();
  await servidor.connect(ladoDoServidor);
  const cliente = new Client({ name: "teste", version: "0" });
  await cliente.connect(ladoDoCliente);
  return cliente;
}

async function textoDoRoteiro(cliente: Client, name: string, argumentos: Record<string, string> = {}): Promise<string> {
  const resultado = await cliente.getPrompt({ name, arguments: argumentos });
  return resultado.messages.map((m) => (m.content.type === "text" ? m.content.text : "")).join("\n");
}

test("oferece os quatro roteiros, com descrição", async () => {
  const cliente = await conectar();
  const { prompts } = await cliente.listPrompts();
  expect(prompts.map((p) => p.name).sort()).toEqual([
    "como_estou",
    "estudar_assunto",
    "revisao_dos_erros",
    "simulado_rapido",
  ]);
  for (const roteiro of prompts) expect(roteiro.description?.length ?? 0).toBeGreaterThan(20);
});

test("simulado_rapido usa a quantidade e a área pedidas", async () => {
  const cliente = await conectar();
  const texto = await textoDoRoteiro(cliente, "simulado_rapido", { quantidade: "5", area: "matematica" });
  expect(texto).toContain("5 questões");
  expect(texto).toContain("Matemática e suas Tecnologias");
  expect(texto).toContain('area="matematica"');
  expect(texto).toContain("buscar_questoes");
  expect(texto).toContain("corrigir_resposta");
});

test("simulado_rapido sem argumentos usa 10 questões de todas as áreas", async () => {
  const cliente = await conectar();
  const texto = await textoDoRoteiro(cliente, "simulado_rapido");
  expect(texto).toContain("10 questões");
  expect(texto).not.toContain("area=");
});

test("simulado_rapido limita a quantidade a 20 e recusa o que não é número", async () => {
  const cliente = await conectar();
  expect(await textoDoRoteiro(cliente, "simulado_rapido", { quantidade: "90" })).toContain("20 questões");
  await expect(cliente.getPrompt({ name: "simulado_rapido", arguments: { quantidade: "muitas" } })).rejects.toThrow();
  await expect(cliente.getPrompt({ name: "simulado_rapido", arguments: { area: "culinaria" } })).rejects.toThrow();
});

test("estudar_assunto exige o assunto e o usa na busca e na classificação", async () => {
  const cliente = await conectar();
  const texto = await textoDoRoteiro(cliente, "estudar_assunto", { assunto: "logaritmos" });
  expect(texto).toContain("logaritmos");
  expect(texto).toContain("palavras_chave");
  await expect(cliente.getPrompt({ name: "estudar_assunto", arguments: {} })).rejects.toThrow();
});

test("os roteiros só citam ferramentas que existem", async () => {
  const cliente = await conectar();
  const ferramentas = new Set((await cliente.listTools()).tools.map((t) => t.name));
  const textos = [
    await textoDoRoteiro(cliente, "simulado_rapido"),
    await textoDoRoteiro(cliente, "revisao_dos_erros"),
    await textoDoRoteiro(cliente, "estudar_assunto", { assunto: "genética" }),
    await textoDoRoteiro(cliente, "como_estou"),
  ];
  const citadas = textos.flatMap((texto) => texto.match(/\b(?:buscar|corrigir|ver|revisar|obter|listar|desfazer)_[a-z_]+/g) ?? []);
  expect(citadas.length).toBeGreaterThan(6);
  for (const nome of citadas) expect(ferramentas, `ferramenta citada: ${nome}`).toContain(nome);
});
