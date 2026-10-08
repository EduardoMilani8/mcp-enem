export const AREAS = ["linguagens", "ciencias-humanas", "ciencias-natureza", "matematica"] as const;
export type Area = (typeof AREAS)[number];

export const NOMES_DAS_AREAS: Record<Area, string> = {
  linguagens: "Linguagens, Códigos e suas Tecnologias",
  "ciencias-humanas": "Ciências Humanas e suas Tecnologias",
  "ciencias-natureza": "Ciências da Natureza e suas Tecnologias",
  matematica: "Matemática e suas Tecnologias",
};

export const IDIOMAS = ["ingles", "espanhol"] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const LETRAS = ["A", "B", "C", "D", "E"] as const;
export type Letra = (typeof LETRAS)[number];

export interface Alternativa {
  letra: Letra;
  texto: string | null;
  imagem: string | null;
}

/** A questão como o aluno pode ver: sem o gabarito. */
export interface QuestaoPublica {
  ano: number;
  numero: number;
  area: Area;
  /** Só as questões de língua estrangeira têm idioma. */
  idioma: Idioma | null;
  contexto: string | null;
  enunciado: string | null;
  imagens: string[];
  alternativas: Alternativa[];
  /** Imagem quebrada na origem ou alternativa vazia: não serve para estudo. */
  incompleta: boolean;
}

export interface Questao extends QuestaoPublica {
  gabarito: Letra;
}

export interface Prova {
  ano: number;
  titulo: string;
  idiomas: Idioma[];
}

export type CodigoDeErro = "nao_encontrado" | "limite" | "indisponivel" | "resposta_invalida";

/** Erro esperado, com mensagem pronta para ser mostrada ao aluno. */
export class ErroEnem extends Error {
  readonly codigo: CodigoDeErro;

  constructor(codigo: CodigoDeErro, mensagem: string) {
    super(mensagem);
    this.name = "ErroEnem";
    this.codigo = codigo;
  }
}

export function chaveDaQuestao(q: { ano: number; numero: number; idioma: Idioma | null }): string {
  return `${q.ano}-${q.numero}-${q.idioma ?? "pt"}`;
}

export function paraPublica(questao: Questao): QuestaoPublica {
  const { gabarito: _gabarito, ...publica } = questao;
  return publica;
}
