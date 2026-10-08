import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registrarFerramentas, type Dependencias } from "./ferramentas/registrar.js";
import { VERSAO } from "./versao.js";

export function criarServidor(dependencias: Dependencias): McpServer {
  const servidor = new McpServer({ name: "mcp-enem", version: VERSAO });
  registrarFerramentas(servidor, dependencias);
  return servidor;
}
