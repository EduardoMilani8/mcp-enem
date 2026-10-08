import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { log } from "./log.js";

export async function lerJson<T>(caminho: string): Promise<T | null> {
  let texto: string;
  try {
    texto = await readFile(caminho, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    log(`arquivo corrompido, descartando: ${caminho}`);
    await rm(caminho, { force: true });
    return null;
  }
}

// Grava num temporário e renomeia: se o programa cair no meio, o arquivo
// antigo continua inteiro.
export async function gravarJson(caminho: string, dados: unknown): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.tmp`;
  await writeFile(temporario, JSON.stringify(dados), "utf8");
  await rename(temporario, caminho);
}
