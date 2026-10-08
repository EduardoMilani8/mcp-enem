import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pastaTemporaria(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mcp-enem-"));
}
