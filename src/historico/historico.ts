import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { AREAS, IDIOMAS, LETRAS, MATERIAS } from "../enem/tipos.js";
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
  // Opcionais: as tentativas antigas não têm, e nem toda correção informa.
  // Um valor desconhecido é ignorado em vez de descartar a tentativa inteira.
  materia: z.enum(MATERIAS).optional().catch(undefined),
  assunto: z.string().optional().catch(undefined),
});

export type Tentativa = z.infer<typeof esquemaDaTentativa>;

/** Uma tentativa por linha (JSONL). Registrar só acrescenta: uma queda não estraga o que já foi gravado. */
export class Historico {
  private readonly caminho: string;

  constructor(caminho: string) {
    this.caminho = caminho;
  }

  async registrar(tentativa: Tentativa): Promise<void> {
    await mkdir(dirname(this.caminho), { recursive: true });
    // Se a gravação anterior foi interrompida, a última linha ficou sem fim;
    // sem a quebra, esta tentativa seria colada nela e as duas se perderiam.
    const prefixo = (await this.terminaComLinhaCortada()) ? "\n" : "";
    await appendFile(this.caminho, `${prefixo}${JSON.stringify(tentativa)}\n`, "utf8");
  }

  /**
   * Desfaz o último registro e o devolve (null se não houver nenhum). É a única
   * operação que reescreve o arquivo; por isso grava num temporário e renomeia.
   */
  async removerUltima(): Promise<Tentativa | null> {
    const tentativas = await this.ler();
    const ultima = tentativas.pop();
    if (!ultima) return null;
    const temporario = `${this.caminho}.${randomUUID()}.tmp`;
    await writeFile(temporario, tentativas.map((t) => `${JSON.stringify(t)}\n`).join(""), "utf8");
    await rename(temporario, this.caminho);
    return ultima;
  }

  private async terminaComLinhaCortada(): Promise<boolean> {
    let arquivo;
    try {
      arquivo = await open(this.caminho, "r");
    } catch {
      return false;
    }
    try {
      const { size } = await arquivo.stat();
      if (size === 0) return false;
      const { buffer } = await arquivo.read(Buffer.alloc(1), 0, 1, size - 1);
      return buffer[0] !== 0x0a;
    } finally {
      await arquivo.close();
    }
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
