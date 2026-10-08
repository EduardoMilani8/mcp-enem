import { AREAS, NOMES_DAS_AREAS, type Idioma, type QuestaoPublica } from "../enem/tipos.js";
import type { Desempenho, Placar } from "../historico/estatisticas.js";

const NOMES_DOS_IDIOMAS: Record<Idioma, string> = { ingles: "inglês", espanhol: "espanhol" };

export function formatarQuestao(questao: QuestaoPublica): string {
  const linhas = [`## ENEM ${questao.ano} · Questão ${questao.numero} · ${NOMES_DAS_AREAS[questao.area]}`];
  if (questao.idioma) linhas.push(`Língua estrangeira: ${NOMES_DOS_IDIOMAS[questao.idioma]}`);
  if (questao.contexto) linhas.push("", questao.contexto);
  if (questao.enunciado) linhas.push("", questao.enunciado);
  linhas.push("");
  for (const alternativa of questao.alternativas) {
    const imagem = alternativa.imagem ? ` [imagem](${alternativa.imagem})` : "";
    linhas.push(`${alternativa.letra}) ${alternativa.texto ?? ""}${imagem}`.trimEnd());
  }
  if (questao.imagens.length > 0) linhas.push("", `Imagens da questão: ${questao.imagens.join(" ")}`);
  return linhas.join("\n");
}

export function formatarDesempenho(desempenho: Desempenho): string {
  const linha = (rotulo: string, placar: Placar) =>
    `- ${rotulo}: ${placar.acertos} de ${placar.total} (${placar.percentual}%)`;
  const linhas = [
    "## Desempenho",
    linha("Geral", desempenho.geral),
    linha("Últimos 7 dias", desempenho.ultimos7Dias),
    "",
    "### Por área",
  ];
  for (const area of AREAS) {
    const placar = desempenho.porArea[area];
    if (placar) linhas.push(linha(NOMES_DAS_AREAS[area], placar));
  }
  return linhas.join("\n");
}
