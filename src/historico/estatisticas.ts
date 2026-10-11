import { AREAS, chaveDaQuestao, MATERIAS, type Area, type Materia } from "../enem/tipos.js";
import type { Tentativa } from "./historico.js";

export interface Placar {
  total: number;
  acertos: number;
  /** De 0 a 100, arredondado. */
  percentual: number;
}

export interface Desempenho {
  geral: Placar;
  porArea: Partial<Record<Area, Placar>>;
  ultimos7Dias: Placar;
  /** Só das tentativas em que a matéria foi informada na correção. */
  porMateria: Partial<Record<Materia, Placar>>;
  /** Quantas tentativas consideradas não têm matéria registrada. */
  semMateria: number;
  /** Até cinco assuntos, do que tem mais erros para o que tem menos. */
  assuntosComMaisErros: AssuntoComErros[];
}

export interface AssuntoComErros {
  assunto: string;
  erros: number;
  total: number;
}

export interface OpcoesDeDesempenho {
  area?: Area;
  materia?: Materia;
  /** Considera só as tentativas dos últimos N dias. */
  dias?: number;
  agora?: Date;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function placar(tentativas: Tentativa[]): Placar {
  const total = tentativas.length;
  const acertos = tentativas.filter((t) => t.acertou).length;
  return { total, acertos, percentual: total === 0 ? 0 : Math.round((acertos / total) * 100) };
}

function dosUltimosDias(tentativas: Tentativa[], dias: number, agora: Date): Tentativa[] {
  const limite = agora.getTime() - dias * MS_POR_DIA;
  return tentativas.filter((t) => {
    const quando = Date.parse(t.quando);
    return !Number.isNaN(quando) && quando >= limite;
  });
}

const MAXIMO_DE_ASSUNTOS = 5;

// O assunto é texto livre: "Logaritmos" e " logaritmos" são o mesmo.
function assuntosComMaisErros(tentativas: Tentativa[]): AssuntoComErros[] {
  const porAssunto = new Map<string, AssuntoComErros>();
  for (const tentativa of tentativas) {
    const nome = tentativa.assunto?.trim().replace(/\s+/g, " ");
    if (!nome) continue;
    const chave = nome.toLowerCase();
    const atual = porAssunto.get(chave) ?? { assunto: nome, erros: 0, total: 0 };
    atual.total++;
    if (!tentativa.acertou) atual.erros++;
    porAssunto.set(chave, atual);
  }
  return [...porAssunto.values()]
    .filter((a) => a.erros > 0)
    .sort((a, b) => b.erros - a.erros || b.total - a.total || a.assunto.localeCompare(b.assunto))
    .slice(0, MAXIMO_DE_ASSUNTOS);
}

export function calcularDesempenho(tentativas: Tentativa[], opcoes: OpcoesDeDesempenho = {}): Desempenho {
  const agora = opcoes.agora ?? new Date();
  let consideradas = opcoes.area ? tentativas.filter((t) => t.area === opcoes.area) : tentativas;
  if (opcoes.materia) consideradas = consideradas.filter((t) => t.materia === opcoes.materia);
  if (opcoes.dias !== undefined) consideradas = dosUltimosDias(consideradas, opcoes.dias, agora);

  const porArea: Partial<Record<Area, Placar>> = {};
  for (const area of AREAS) {
    const daArea = consideradas.filter((t) => t.area === area);
    if (daArea.length > 0) porArea[area] = placar(daArea);
  }
  const porMateria: Partial<Record<Materia, Placar>> = {};
  for (const materia of MATERIAS) {
    const daMateria = consideradas.filter((t) => t.materia === materia);
    if (daMateria.length > 0) porMateria[materia] = placar(daMateria);
  }
  return {
    geral: placar(consideradas),
    porArea,
    ultimos7Dias: placar(dosUltimosDias(consideradas, 7, agora)),
    porMateria,
    semMateria: consideradas.filter((t) => t.materia === undefined).length,
    assuntosComMaisErros: assuntosComMaisErros(consideradas),
  };
}

export function chavesRespondidas(tentativas: Tentativa[]): Set<string> {
  return new Set(tentativas.map(chaveDaQuestao));
}

/**
 * Devolve uma tentativa para cada questão que o aluno ainda precisa rever.
 * As tentativas chegam na ordem em que aconteceram (a mais antiga primeiro).
 */
export function errosPendentes(tentativas: Tentativa[]): Tentativa[] {
  // Vale a última tentativa: quem acertou e depois errou volta para a revisão.
  const ultimaPorQuestao = new Map<string, Tentativa>();
  for (const tentativa of tentativas) ultimaPorQuestao.set(chaveDaQuestao(tentativa), tentativa);
  return [...ultimaPorQuestao.values()].filter((t) => !t.acertou);
}
