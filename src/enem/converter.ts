import { AREAS, IDIOMAS, LETRAS, type Alternativa, type Questao } from "./tipos.js";

/** A questão no formato em que a api.enem.dev devolve. */
export interface QuestaoApi {
  index: number;
  year: number;
  discipline: string | null;
  language: string | null;
  context: string | null;
  files: string[] | null;
  correctAlternative: string | null;
  alternativesIntroduction: string | null;
  alternatives: { letter: string; text: string | null; file: string | null }[] | null;
}

const MARCA_DE_IMAGEM_QUEBRADA = "broken-image";

/** Devolve null quando a questão não tem o mínimo para ser usada. */
export function converterQuestao(q: QuestaoApi): Questao | null {
  const area = AREAS.find((a) => a === q.discipline);
  const gabarito = LETRAS.find((l) => l === q.correctAlternative);
  if (!area || !gabarito || !Array.isArray(q.alternatives) || q.alternatives.length === 0) return null;

  const alternativas: Alternativa[] = [];
  for (const a of q.alternatives) {
    const letra = LETRAS.find((l) => l === a.letter);
    if (!letra) return null;
    alternativas.push({ letra, texto: a.text ?? null, imagem: a.file ?? null });
  }

  const imagens = q.files ?? [];
  const enderecos = [...imagens, ...alternativas.map((a) => a.imagem ?? "")];
  const incompleta =
    (q.context ?? "").includes(MARCA_DE_IMAGEM_QUEBRADA) ||
    enderecos.some((endereco) => endereco.includes(MARCA_DE_IMAGEM_QUEBRADA)) ||
    alternativas.some((a) => !a.texto && !a.imagem);

  return {
    ano: q.year,
    numero: q.index,
    area,
    idioma: IDIOMAS.find((i) => i === q.language) ?? null,
    contexto: q.context ?? null,
    enunciado: q.alternativesIntroduction ?? null,
    imagens,
    alternativas,
    incompleta,
    gabarito,
  };
}
