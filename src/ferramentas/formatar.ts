import {
  AREAS,
  MATERIAS,
  NOMES_DAS_AREAS,
  NOMES_DAS_MATERIAS,
  type Idioma,
  type QuestaoPublica,
} from "../enem/tipos.js";
import type { Desempenho, Placar } from "../historico/estatisticas.js";

export const NOMES_DOS_IDIOMAS: Record<Idioma, string> = { ingles: "inglês", espanhol: "espanhol" };

export function formatarQuestao(questao: QuestaoPublica): string {
  const linhas = [`## ENEM ${questao.ano} · Questão ${questao.numero} · ${NOMES_DAS_AREAS[questao.area]}`];
  if (questao.idioma) linhas.push(`Língua estrangeira: ${NOMES_DOS_IDIOMAS[questao.idioma]}`);
  if (questao.incompleta) {
    linhas.push("Atenção: esta questão está incompleta na fonte de dados (falta uma imagem ou uma alternativa). Avise o aluno.");
  }
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

  // As matérias seguem a ordem das provas (a mesma de MATERIAS), não a alfabética.
  const materias = MATERIAS.filter((materia) => desempenho.porMateria[materia]);
  if (materias.length > 0) {
    linhas.push("", "### Por matéria");
    for (const materia of materias) {
      const placar = desempenho.porMateria[materia];
      if (placar) linhas.push(linha(NOMES_DAS_MATERIAS[materia], placar));
    }
    if (desempenho.semMateria > 0) linhas.push(`- (${desempenho.semMateria} tentativa(s) sem matéria registrada)`);
  }

  if (desempenho.assuntosComMaisErros.length > 0) {
    linhas.push("", "### Assuntos com mais erros");
    for (const { assunto, erros, total } of desempenho.assuntosComMaisErros) {
      linhas.push(`- ${assunto}: ${erros} erro(s) em ${total} tentativa(s)`);
    }
  }
  return linhas.join("\n");
}
