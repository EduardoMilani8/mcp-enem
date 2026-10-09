import { createHash, randomUUID } from "node:crypto";
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

const EXTENSOES_ACEITAS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identifica o formato pelos primeiros bytes. Um servidor com problema pode
 * responder 200 com uma página de erro no lugar da figura; a extensão da URL
 * não garante nada.
 */
function tipoPeloConteudo(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(ASSINATURA_PNG)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const inicio = bytes.subarray(0, 12).toString("latin1");
  if (inicio.startsWith("GIF87a") || inicio.startsWith("GIF89a")) return "image/gif";
  if (inicio.startsWith("RIFF") && inicio.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

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
    if (!EXTENSOES_ACEITAS.has(extensao)) return null;

    const nome = createHash("sha256").update(url).digest("hex").slice(0, 32) + extensao;
    const caminho = join(this.pasta, nome);
    try {
      const guardada = await readFile(caminho);
      const mimeType = tipoPeloConteudo(guardada);
      if (mimeType) return { dados: guardada.toString("base64"), mimeType };
      // arquivo em cache que não é imagem: baixa de novo por cima
    } catch {
      // ainda não está em cache
    }

    try {
      const resposta = await this.buscar(url, { signal: AbortSignal.timeout(this.tempoLimiteMs) });
      if (!resposta.ok) return null;
      const bytes = Buffer.from(await resposta.arrayBuffer());
      if (bytes.length === 0 || bytes.length > this.limiteBytes) return null;
      const mimeType = tipoPeloConteudo(bytes);
      if (!mimeType) return null;
      await mkdir(this.pasta, { recursive: true });
      const temporario = `${caminho}.${randomUUID()}.tmp`;
      await writeFile(temporario, bytes);
      await rename(temporario, caminho);
      return { dados: bytes.toString("base64"), mimeType };
    } catch (erro) {
      log(`não consegui baixar a imagem ${url}:`, erro);
      return null;
    }
  }
}
