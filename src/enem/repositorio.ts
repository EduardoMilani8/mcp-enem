import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gravarJson, lerJson } from "../disco.js";
import { z } from "zod";
import { log } from "../log.js";
import { AREAS, ErroEnem, IDIOMAS, LETRAS, type Idioma, type Prova, type Questao } from "./tipos.js";

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

/** Toda prova do ENEM tem cerca de 180 questões; bem menos que isso é download pela metade. */
const MINIMO_DE_QUESTOES_POR_PROVA = 150;

// O cache é um arquivo no disco do usuário: pode ter sido editado, cortado ou
// gravado por uma versão antiga. Só é usado se tiver o formato esperado.
const esquemaDoCacheDeUmAno = z
  .array(
    z.object({
      ano: z.number().int(),
      numero: z.number().int(),
      area: z.enum(AREAS),
      idioma: z.enum(IDIOMAS).nullable(),
      contexto: z.string().nullable(),
      enunciado: z.string().nullable(),
      imagens: z.array(z.string()),
      alternativas: z
        .array(z.object({ letra: z.enum(LETRAS), texto: z.string().nullable(), imagem: z.string().nullable() }))
        .min(1),
      incompleta: z.boolean(),
      gabarito: z.enum(LETRAS),
    }),
  )
  .min(MINIMO_DE_QUESTOES_POR_PROVA);

export class RepositorioEnem {
  private readonly fonte: FonteDeDados;
  private readonly pasta: string;
  private readonly agora: () => number;
  private readonly anosNaMemoria = new Map<number, Questao[]>();
  // Pedidos simultâneos da mesma coisa compartilham um único download.
  private readonly anosEmAndamento = new Map<number, Promise<Questao[]>>();
  private provasEmAndamento: Promise<Prova[]> | null = null;

  constructor(fonte: FonteDeDados, pasta: string, agora: () => number = Date.now) {
    this.fonte = fonte;
    this.pasta = pasta;
    this.agora = agora;
  }

  listarProvas(): Promise<Prova[]> {
    this.provasEmAndamento ??= this.carregarProvas().finally(() => {
      this.provasEmAndamento = null;
    });
    return this.provasEmAndamento;
  }

  private async carregarProvas(): Promise<Prova[]> {
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

    let emAndamento = this.anosEmAndamento.get(ano);
    if (!emAndamento) {
      emAndamento = this.carregarAno(ano).finally(() => this.anosEmAndamento.delete(ano));
      this.anosEmAndamento.set(ano, emAndamento);
    }
    return emAndamento;
  }

  private async carregarAno(ano: number): Promise<Questao[]> {
    const caminho = join(this.pasta, `${ano}.json`);
    const bruto = await lerJson<unknown>(caminho);
    const guardadas = esquemaDoCacheDeUmAno.safeParse(bruto);
    if (guardadas.success) {
      this.anosNaMemoria.set(ano, guardadas.data);
      return guardadas.data;
    }
    if (bruto !== null) log(`cache de ${ano} com formato inesperado; baixando de novo`);

    const provas = await this.listarProvas();
    const prova = provas.find((p) => p.ano === ano);
    if (!prova) {
      throw new ErroEnem(
        "nao_encontrado",
        `Não há prova do ENEM de ${ano}. Anos disponíveis: ${provas.map((p) => p.ano).join(", ")}.`,
      );
    }
    const questoes = await this.fonte.questoesDoAno(prova);
    if (questoes.length < MINIMO_DE_QUESTOES_POR_PROVA) {
      throw new ErroEnem(
        "resposta_invalida",
        `A API do ENEM devolveu a prova de ${ano} incompleta (${questoes.length} questões). Tente de novo em instantes.`,
      );
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
