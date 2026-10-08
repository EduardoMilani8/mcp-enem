import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { log } from "../log.js";

export interface ImagemCarregada {
  /** Conteúdo em base64. */
  dados: string;
  mimeType: string;
}

export interface OpcoesDeImagens {
  buscar?: typeof fetch;
  limiteBytes?: number;
  tempoLimiteMs?: number;
}

const TIPOS_POR_EXTENSAO: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export class CarregadorDeImagens {
  private readonly pasta: string;
  private readonly buscar: typeof fetch;
  private readonly limiteBytes: number;
  private readonly tempoLimiteMs: number;

  constructor(pasta: string, opcoes: OpcoesDeImagens = {}) {
    this.pasta = pasta;
    this.buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
    this.limiteBytes = opcoes.limiteBytes ?? 1_500_000;
    this.tempoLimiteMs = opcoes.tempoLimiteMs ?? 15_000;
  }

  /** Nunca lança erro: uma imagem que falha não pode derrubar a questão. */
  async carregar(url: string): Promise<ImagemCarregada | null> {
    let endereco: URL;
    try {
      endereco = new URL(url);
    } catch {
      return null;
    }
    if (endereco.protocol !== "https:") return null;
    const extensao = extname(endereco.pathname).toLowerCase();
    const mimeType = TIPOS_POR_EXTENSAO[extensao];
    if (!mimeType) return null;

    const nome = createHash("sha256").update(url).digest("hex").slice(0, 32) + extensao;
    const caminho = join(this.pasta, nome);
    try {
      return { dados: (await readFile(caminho)).toString("base64"), mimeType };
    } catch {
      // ainda não está em cache
    }

    try {
      const resposta = await this.buscar(url, { signal: AbortSignal.timeout(this.tempoLimiteMs) });
      if (!resposta.ok) return null;
      const bytes = Buffer.from(await resposta.arrayBuffer());
      if (bytes.length === 0 || bytes.length > this.limiteBytes) return null;
      await mkdir(this.pasta, { recursive: true });
      const temporario = `${caminho}.${process.pid}.tmp`;
      await writeFile(temporario, bytes);
      await rename(temporario, caminho);
      return { dados: bytes.toString("base64"), mimeType };
    } catch (erro) {
      log(`não consegui baixar a imagem ${url}:`, erro);
      return null;
    }
  }
}
