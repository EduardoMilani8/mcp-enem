import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gravarJson, lerJson } from "../disco.js";
import { ErroEnem, type Idioma, type Prova, type Questao } from "./tipos.js";

export interface FonteDeDados {
  listarProvas(): Promise<Prova[]>;
  questoesDoAno(prova: Prova): Promise<Questao[]>;
}

interface ProvasGuardadas {
  baixadoEm: number;
  provas: Prova[];
}

// A lista de provas pode ganhar um ano novo; as questões de um ano nunca mudam.
const VALIDADE_DA_LISTA_DE_PROVAS_MS = 7 * 24 * 60 * 60 * 1000;

export class RepositorioEnem {
  private readonly fonte: FonteDeDados;
  private readonly pasta: string;
  private readonly agora: () => number;
  private readonly anosNaMemoria = new Map<number, Questao[]>();

  constructor(fonte: FonteDeDados, pasta: string, agora: () => number = Date.now) {
    this.fonte = fonte;
    this.pasta = pasta;
    this.agora = agora;
  }

  async listarProvas(): Promise<Prova[]> {
    const caminho = join(this.pasta, "provas.json");
    const guardado = await lerJson<ProvasGuardadas>(caminho);
    const provasGuardadas =
      guardado !== null && Array.isArray(guardado.provas) && guardado.provas.length > 0 ? guardado.provas : null;
    if (provasGuardadas && guardado && this.agora() - guardado.baixadoEm < VALIDADE_DA_LISTA_DE_PROVAS_MS) {
      return provasGuardadas;
    }
    try {
      const provas = await this.fonte.listarProvas();
      if (provas.length === 0) throw new ErroEnem("resposta_invalida", "A API do ENEM não devolveu nenhuma prova.");
      const paraGuardar: ProvasGuardadas = { baixadoEm: this.agora(), provas };
      await gravarJson(caminho, paraGuardar);
      return provas;
    } catch (erro) {
      if (provasGuardadas) return provasGuardadas;
      throw erro;
    }
  }

  async anosEmCache(): Promise<number[]> {
    let nomes: string[];
    try {
      nomes = await readdir(this.pasta);
    } catch {
      return [];
    }
    const anos: number[] = [];
    for (const nome of nomes) {
      const achado = /^(\d{4})\.json$/.exec(nome);
      if (achado?.[1]) anos.push(Number(achado[1]));
    }
    return anos.sort((a, b) => a - b);
  }

  /** Os anos que dá para usar agora; sem rede, só os que já foram baixados. */
  async anosDisponiveis(): Promise<number[]> {
    try {
      return (await this.listarProvas()).map((p) => p.ano);
    } catch (erro) {
      const emCache = await this.anosEmCache();
      if (emCache.length > 0) return emCache;
      throw erro;
    }
  }

  async questoesDoAno(ano: number): Promise<Questao[]> {
    const naMemoria = this.anosNaMemoria.get(ano);
    if (naMemoria) return naMemoria;

    const caminho = join(this.pasta, `${ano}.json`);
    const guardadas = await lerJson<Questao[]>(caminho);
    if (Array.isArray(guardadas) && guardadas.length > 0) {
      this.anosNaMemoria.set(ano, guardadas);
      return guardadas;
    }

    const provas = await this.listarProvas();
    const prova = provas.find((p) => p.ano === ano);
    if (!prova) {
      throw new ErroEnem(
        "nao_encontrado",
        `Não há prova do ENEM de ${ano}. Anos disponíveis: ${provas.map((p) => p.ano).join(", ")}.`,
      );
    }
    const questoes = await this.fonte.questoesDoAno(prova);
    if (questoes.length === 0) {
      throw new ErroEnem("resposta_invalida", `A API do ENEM não devolveu questões para ${ano}.`);
    }
    await gravarJson(caminho, questoes);
    this.anosNaMemoria.set(ano, questoes);
    return questoes;
  }

  async obterQuestao(ano: number, numero: number, idioma: Idioma = "ingles"): Promise<Questao> {
    const questoes = await this.questoesDoAno(ano);
    const candidatas = questoes.filter((q) => q.numero === numero);
    const escolhida =
      candidatas.find((q) => q.idioma === idioma) ?? candidatas.find((q) => q.idioma === null) ?? candidatas[0];
    if (!escolhida) {
      const numeros = questoes.map((q) => q.numero);
      throw new ErroEnem(
        "nao_encontrado",
        `A questão ${numero} do ENEM ${ano} não está disponível (pode ter sido anulada). ` +
          `Os números vão de ${Math.min(...numeros)} a ${Math.max(...numeros)}.`,
      );
    }
    return escolhida;
  }
}
