import { expect, test } from "vitest";
import { converterQuestao } from "../src/enem/converter.js";
import { paraPublica } from "../src/enem/tipos.js";
import { formatarQuestao } from "../src/ferramentas/formatar.js";
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
