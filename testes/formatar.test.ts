import { expect, test } from "vitest";
import { converterQuestao } from "../src/enem/converter.js";
import { paraPublica } from "../src/enem/tipos.js";
import { formatarDesempenho, formatarQuestao } from "../src/ferramentas/formatar.js";
import { calcularDesempenho } from "../src/historico/estatisticas.js";
import type { Tentativa } from "../src/historico/historico.js";
import { questaoApi } from "./apoio.js";

function formatada(extras: Parameters<typeof questaoApi>[1] = {}): string {
  const questao = converterQuestao(questaoApi(7, extras));
  if (!questao) throw new Error("questão de teste inválida");
  return formatarQuestao(paraPublica(questao));
}

test("avisa quando a questão está incompleta na fonte", () => {
  const texto = formatada({ alternatives: [{ letter: "A", text: null, file: null }] });
  expect(texto).toContain("incompleta");
});

test("não avisa em questão completa", () => {
  expect(formatada()).not.toContain("incompleta");
});

function tentativa(extras: Partial<Tentativa>): Tentativa {
  return {
    quando: "2026-10-08T12:00:00.000Z",
    ano: 2023,
    numero: 100,
    idioma: null,
    area: "ciencias-natureza",
    resposta: "B",
    correta: "B",
    acertou: true,
    ...extras,
  };
}

test("o desempenho mostra as matérias e os assuntos com mais erros", () => {
  const texto = formatarDesempenho(
    calcularDesempenho([
      tentativa({ numero: 100, materia: "quimica", assunto: "estequiometria" }),
      tentativa({ numero: 101, materia: "quimica", assunto: "estequiometria", acertou: false, resposta: "C" }),
      tentativa({ numero: 102, materia: "fisica", assunto: "cinemática", acertou: false, resposta: "C" }),
      tentativa({ numero: 103 }),
    ]),
  );
  expect(texto).toContain("### Por matéria");
  expect(texto).toContain("- Química: 1 de 2 (50%)");
  expect(texto).toContain("- Física: 0 de 1 (0%)");
  expect(texto).toContain("1 tentativa(s) sem matéria registrada");
  expect(texto).toContain("### Assuntos com mais erros");
  expect(texto).toContain("- estequiometria: 1 erro(s) em 2 tentativa(s)");
  expect(texto.indexOf("Física")).toBeLessThan(texto.indexOf("Química"));
});

test("sem matéria nem assunto registrados, o desempenho não mostra essas seções", () => {
  const texto = formatarDesempenho(calcularDesempenho([tentativa({ numero: 100 })]));
  expect(texto).not.toContain("Por matéria");
  expect(texto).not.toContain("sem matéria");
  expect(texto).not.toContain("Assuntos com mais erros");
});
