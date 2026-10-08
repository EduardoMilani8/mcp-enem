import { homedir } from "node:os";
import { join } from "node:path";

export function diretorioDeDados(env: NodeJS.ProcessEnv = process.env): string {
  const personalizado = env.MCP_ENEM_DIR?.trim();
  return personalizado ? personalizado : join(homedir(), ".mcp-enem");
}
