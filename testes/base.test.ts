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

test("expande o ~ de MCP_ENEM_DIR, que num JSON de configuração chega literal", () => {
  expect(diretorioDeDados({ MCP_ENEM_DIR: "~/estudos/enem" })).toBe(join(homedir(), "estudos", "enem"));
  expect(diretorioDeDados({ MCP_ENEM_DIR: "~" })).toBe(homedir());
  expect(diretorioDeDados({ MCP_ENEM_DIR: "/tmp/~nao-mexe" })).toBe("/tmp/~nao-mexe");
});
