import { randomUUID } from "node:crypto";
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
// antigo continua inteiro. O nome do temporário é único para que duas
// gravações ao mesmo tempo não disputem o mesmo arquivo.
export async function gravarJson(caminho: string, dados: unknown): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${randomUUID()}.tmp`;
  await writeFile(temporario, JSON.stringify(dados), "utf8");
  await rename(temporario, caminho);
}
