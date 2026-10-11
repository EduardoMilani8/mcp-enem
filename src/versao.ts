import { createRequire } from "node:module";

// Lida do package.json para existir em um lugar só. O caminho vale tanto para
// src/versao.ts quanto para dist/versao.js.
const pacote = createRequire(import.meta.url)("../package.json") as { version: string };

export const VERSAO: string = pacote.version;

/**
 * Como o servidor se apresenta nas requisições. A enem.dev é um projeto
 * gratuito mantido por uma pessoa: ela deve conseguir saber de onde vem o
 * tráfego e a quem recorrer se algo estiver errado.
 */
export const IDENTIFICACAO = `mcp-enem/${VERSAO} (+https://github.com/EduardoMilani8/mcp-enem)`;
