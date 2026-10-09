import { homedir } from "node:os";
import { join } from "node:path";

export function diretorioDeDados(env: NodeJS.ProcessEnv = process.env): string {
  const personalizado = env.MCP_ENEM_DIR?.trim();
  if (!personalizado) return join(homedir(), ".mcp-enem");
  // Quem expande o "~" é o shell; num JSON de configuração ele chega literal.
  if (personalizado === "~") return homedir();
  if (personalizado.startsWith("~/")) return join(homedir(), personalizado.slice(2));
  return personalizado;
}
