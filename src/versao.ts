import { createRequire } from "node:module";

// Lida do package.json para existir em um lugar só. O caminho vale tanto para
// src/versao.ts quanto para dist/versao.js.
const pacote = createRequire(import.meta.url)("../package.json") as { version: string };

export const VERSAO: string = pacote.version;
