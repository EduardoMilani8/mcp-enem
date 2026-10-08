// O stdout é o canal do protocolo MCP; qualquer texto ali corrompe a conversa.
export function log(...partes: unknown[]): void {
  console.error("[mcp-enem]", ...partes);
}
