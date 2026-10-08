import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QuestaoApi } from "../src/enem/converter.js";

export function pastaTemporaria(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mcp-enem-"));
}

export function questaoApi(numero: number, extras: Partial<QuestaoApi> = {}): QuestaoApi {
  return {
    index: numero,
    year: 2023,
    discipline: "matematica",
    language: null,
    context: `Contexto ${numero}`,
    files: [],
    correctAlternative: "B",
    alternativesIntroduction: `Enunciado ${numero}`,
    alternatives: ["A", "B", "C", "D", "E"].map((letter) => ({
      letter,
      text: `Alternativa ${letter}`,
      file: null,
    })),
    ...extras,
  };
}

function areaDoNumero(numero: number): string {
  if (numero <= 45) return "linguagens";
  if (numero <= 90) return "ciencias-humanas";
  if (numero <= 135) return "ciencias-natureza";
  return "matematica";
}

/**
 * Uma prova parecida com a real: 180 questões, a 34 anulada, e as de 1 a 5
 * em cada idioma informado. O gabarito é sempre "B".
 */
export function questoesDaProva(
  ano: number,
  idiomas: string[] = ["espanhol", "ingles"],
  extras: Partial<QuestaoApi> = {},
): QuestaoApi[] {
  const lista: QuestaoApi[] = [];
  for (let numero = 1; numero <= 180; numero++) {
    if (numero === 34) continue;
    const base = { year: ano, discipline: areaDoNumero(numero), ...extras };
    if (numero <= 5 && idiomas.length > 0) {
      for (const language of idiomas) lista.push(questaoApi(numero, { ...base, language }));
    } else {
      lista.push(questaoApi(numero, base));
    }
  }
  return lista;
}

export function respostaJson(corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });
}

export interface ProvaFalsa {
  ano: number;
  idiomas: string[];
  questoes: QuestaoApi[];
}

/** Imita a api.enem.dev, incluindo o offset por número e o filtro de idioma. */
export function criarApiFalsa(provas: ProvaFalsa[]): { buscar: typeof fetch; chamadas: string[] } {
  const chamadas: string[] = [];
  const buscar: typeof fetch = async (entrada) => {
    const url = new URL(String(entrada));
    chamadas.push(url.pathname + url.search);
    const partes = url.pathname.split("/").filter(Boolean);
    if (partes.length === 2) {
      return respostaJson(
        provas.map((p) => ({
          title: `ENEM ${p.ano}`,
          year: p.ano,
          languages: p.idiomas.map((value) => ({ label: value, value })),
        })),
      );
    }
    const prova = provas.find((p) => p.ano === Number(partes[2]));
    if (!prova) return respostaJson({ error: { message: "No exam found" } }, 404);
    const pedido = url.searchParams.get("language");
    if (pedido && !prova.idiomas.includes(pedido)) {
      return respostaJson({ error: { message: `Language ${pedido} not found in exam` } }, 400);
    }
    const idioma = pedido ?? prova.idiomas[0] ?? null;
    const limite = Number(url.searchParams.get("limit") ?? 10);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (limite > 50) return respostaJson({ error: { message: "Limit cannot be greater than 50" } }, 400);
    const visiveis = prova.questoes.filter((q) => q.language === null || q.language === idioma);
    return respostaJson({
      metadata: {
        limit: limite,
        offset,
        total: prova.questoes.length,
        hasMore: visiveis.some((q) => q.index > offset + limite),
      },
      questions: visiveis.filter((q) => q.index >= offset && q.index <= offset + limite),
    });
  };
  return { buscar, chamadas };
}
