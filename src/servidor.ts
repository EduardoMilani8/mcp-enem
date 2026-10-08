#!/usr/bin/env node
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { diretorioDeDados } from "./config.js";
import { criarServidor } from "./criar-servidor.js";
import { ClienteApi } from "./enem/api.js";
import { CarregadorDeImagens } from "./enem/imagens.js";
import { RepositorioEnem } from "./enem/repositorio.js";
import { Historico } from "./historico/historico.js";
import { log } from "./log.js";

const pasta = diretorioDeDados();
const servidor = criarServidor({
  repositorio: new RepositorioEnem(new ClienteApi(), join(pasta, "cache")),
  historico: new Historico(join(pasta, "historico.jsonl")),
  imagens: new CarregadorDeImagens(join(pasta, "cache", "imagens")),
});

await servidor.connect(new StdioServerTransport());
log(`servidor iniciado; dados em ${pasta}`);
