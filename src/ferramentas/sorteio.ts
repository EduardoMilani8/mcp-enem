import { chaveDaQuestao, type Area, type Idioma, type Questao, type QuestaoPublica } from "../enem/tipos.js";

export interface Filtro {
  area?: Area;
  idioma: Idioma;
  apenasTexto: boolean;
  /** Chaves (ver chaveDaQuestao) das questões que não devem aparecer. */
  excluir: ReadonlySet<string>;
}

const IMAGEM_EM_MARKDOWN = /!\[[^\]]*\]\(/;

export function temImagem(questao: QuestaoPublica): boolean {
  return (
    questao.imagens.length > 0 ||
    questao.alternativas.some((a) => a.imagem !== null) ||
    IMAGEM_EM_MARKDOWN.test(questao.contexto ?? "")
  );
}

export function filtrar(questoes: Questao[], filtro: Filtro): Questao[] {
  return questoes.filter(
    (q) =>
      !q.incompleta &&
      (filtro.area === undefined || q.area === filtro.area) &&
      (q.idioma === null || q.idioma === filtro.idioma) &&
      (!filtro.apenasTexto || !temImagem(q)) &&
      !filtro.excluir.has(chaveDaQuestao(q)),
  );
}

/** Embaralha uma cópia (Fisher-Yates) e devolve os primeiros itens. */
export function sortear<T>(itens: readonly T[], quantidade: number, aleatorio: () => number = Math.random): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia.slice(0, Math.max(0, quantidade));
}

/**
 * Escolhe de que ano sortear quando o aluno não pediu um ano específico.
 * `disponiveis` nunca vem vazio. `emCache` são os anos já baixados (pode
 * conter anos que não estão em `disponiveis`; ignore esses).
 */
export function escolherAno(
  disponiveis: readonly number[],
  emCache: readonly number[],
  aleatorio: () => number = Math.random,
): number {
  // Na maioria das vezes usa uma prova já baixada (rápido, funciona sem
  // internet); de vez em quando baixa uma nova, para dar variedade.
  const baixados = disponiveis.filter((ano) => emCache.includes(ano));
  const novos = disponiveis.filter((ano) => !emCache.includes(ano));
  const usarBaixados = baixados.length > 0 && (novos.length === 0 || aleatorio() < 0.7);
  const opcoes = usarBaixados ? baixados : novos.length > 0 ? novos : disponiveis;
  return sortear(opcoes, 1, aleatorio)[0] ?? disponiveis[0]!;
}
