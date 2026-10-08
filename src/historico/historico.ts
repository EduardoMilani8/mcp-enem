import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { AREAS, IDIOMAS, LETRAS } from "../enem/tipos.js";
import { log } from "../log.js";

const esquemaDaTentativa = z.object({
  quando: z.string(),
  ano: z.number().int(),
  numero: z.number().int(),
  idioma: z.enum(IDIOMAS).nullable(),
  area: z.enum(AREAS),
  resposta: z.enum(LETRAS),
  correta: z.enum(LETRAS),
  acertou: z.boolean(),
});

export type Tentativa = z.infer<typeof esquemaDaTentativa>;

/** Uma tentativa por linha (JSONL). Só acrescenta: uma queda não estraga o que já foi gravado. */
export class Historico {
  private readonly caminho: string;

  constructor(caminho: string) {
    this.caminho = caminho;
  }

  async registrar(tentativa: Tentativa): Promise<void> {
    await mkdir(dirname(this.caminho), { recursive: true });
    await appendFile(this.caminho, `${JSON.stringify(tentativa)}\n`, "utf8");
  }

  async ler(): Promise<Tentativa[]> {
    let texto: string;
    try {
      texto = await readFile(this.caminho, "utf8");
    } catch {
      return [];
    }
    const tentativas: Tentativa[] = [];
    for (const [indice, linha] of texto.split("\n").entries()) {
      if (linha.trim() === "") continue;
      let bruto: unknown;
      try {
        bruto = JSON.parse(linha);
      } catch {
        log(`linha ${indice + 1} do histórico ignorada: não é JSON`);
        continue;
      }
      const resultado = esquemaDaTentativa.safeParse(bruto);
      if (resultado.success) tentativas.push(resultado.data);
      else log(`linha ${indice + 1} do histórico ignorada: formato inválido`);
    }
    return tentativas;
  }
}
