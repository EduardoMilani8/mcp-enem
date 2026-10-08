import { log } from "../log.js";
import { converterQuestao, type QuestaoApi } from "./converter.js";
import { chaveDaQuestao, ErroEnem, IDIOMAS, type Idioma, type Prova, type Questao } from "./tipos.js";

interface PaginaApi {
  metadata?: { hasMore?: boolean };
  questions?: QuestaoApi[];
}

interface ProvaApi {
  title?: string;
  year?: number;
  languages?: { value?: string }[];
}

export interface OpcoesDaApi {
  buscar?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  /** Tempo mínimo entre duas requisições. A API aceita 10 a cada 10 s. */
  intervaloMs?: number;
  tempoLimiteMs?: number;
  urlBase?: string;
}

const TAMANHO_DA_PAGINA = 50;
const MAXIMO_DE_PAGINAS = 8;
const MAXIMO_DE_TENTATIVAS = 3;
const ESPERA_MAXIMA_MS = 15_000;

export class ClienteApi {
  private readonly buscar: typeof fetch;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly agora: () => number;
  private readonly intervaloMs: number;
  private readonly tempoLimiteMs: number;
  private readonly urlBase: string;
  private ultimoPedido = Number.NEGATIVE_INFINITY;
  private fila: Promise<unknown> = Promise.resolve();

  constructor(opcoes: OpcoesDaApi = {}) {
    this.buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
    this.esperar = opcoes.esperar ?? ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));
    this.agora = opcoes.agora ?? Date.now;
    this.intervaloMs = opcoes.intervaloMs ?? 1100;
    this.tempoLimiteMs = opcoes.tempoLimiteMs ?? 15_000;
    this.urlBase = opcoes.urlBase ?? "https://api.enem.dev/v1";
  }

  async listarProvas(): Promise<Prova[]> {
    const bruto = await this.pedir<ProvaApi[]>("/exams");
    if (!Array.isArray(bruto)) {
      throw new ErroEnem("resposta_invalida", "A API do ENEM devolveu a lista de provas em um formato inesperado.");
    }
    const provas: Prova[] = [];
    for (const p of bruto) {
      if (typeof p.year !== "number") continue;
      const idiomas = IDIOMAS.filter((i) => (p.languages ?? []).some((l) => l.value === i));
      provas.push({ ano: p.year, titulo: p.title ?? `ENEM ${p.year}`, idiomas });
    }
    return provas.sort((a, b) => a.ano - b.ano);
  }

  async questoesDoAno(prova: Prova): Promise<Questao[]> {
    const porChave = new Map<string, Questao>();
    const juntar = (pagina: PaginaApi, apenasIdioma?: Idioma): number => {
      let novas = 0;
      for (const bruta of pagina.questions ?? []) {
        const questao = converterQuestao(bruta);
        if (!questao) {
          log(`questão ${bruta?.index} de ${prova.ano} ignorada: formato inesperado`);
          continue;
        }
        if (apenasIdioma && questao.idioma !== apenasIdioma) continue;
        const chave = chaveDaQuestao(questao);
        if (!porChave.has(chave)) {
          porChave.set(chave, questao);
          novas++;
        }
      }
      return novas;
    };

    // O offset da API é o número da questão, e as páginas se sobrepõem em uma.
    for (let pagina = 0, offset = 0; pagina < MAXIMO_DE_PAGINAS; pagina++, offset += TAMANHO_DA_PAGINA) {
      const resposta = await this.pedir<PaginaApi>(
        `/exams/${prova.ano}/questions?limit=${TAMANHO_DA_PAGINA}&offset=${offset}`,
      );
      const novas = juntar(resposta);
      if (!resposta.metadata?.hasMore || novas === 0) break;
    }

    // Sem "language" a API só devolve um idioma. Os outros são pedidos à parte,
    // só no trecho da prova onde ficam as questões de língua estrangeira.
    const estrangeiras = [...porChave.values()].filter((q) => q.idioma !== null);
    if (estrangeiras.length > 0) {
      const numeros = estrangeiras.map((q) => q.numero);
      const inicio = Math.min(...numeros);
      const tamanho = Math.max(...numeros) - inicio + 1;
      const jaBaixados = new Set(estrangeiras.map((q) => q.idioma));
      for (const idioma of prova.idiomas) {
        if (jaBaixados.has(idioma)) continue;
        const resposta = await this.pedir<PaginaApi>(
          `/exams/${prova.ano}/questions?limit=${tamanho}&offset=${inicio}&language=${idioma}`,
        );
        juntar(resposta, idioma);
      }
    }

    return [...porChave.values()].sort(
      (a, b) => a.numero - b.numero || (a.idioma ?? "").localeCompare(b.idioma ?? ""),
    );
  }

  // Uma requisição por vez: é o que garante o intervalo mínimo entre elas.
  private pedir<T>(caminho: string): Promise<T> {
    const pedido = this.fila.then(() => this.pedirAgora<T>(caminho));
    this.fila = pedido.catch(() => undefined);
    return pedido;
  }

  private async pedirAgora<T>(caminho: string): Promise<T> {
    for (let tentativa = 1; ; tentativa++) {
      const falta = this.ultimoPedido + this.intervaloMs - this.agora();
      if (falta > 0) await this.esperar(falta);
      this.ultimoPedido = this.agora();

      let resposta: Response;
      try {
        resposta = await this.buscar(this.urlBase + caminho, {
          signal: AbortSignal.timeout(this.tempoLimiteMs),
          headers: { accept: "application/json" },
        });
      } catch {
        throw new ErroEnem(
          "indisponivel",
          "Não consegui falar com a API do ENEM (enem.dev). Verifique a internet ou tente de novo em instantes.",
        );
      }

      if (resposta.status === 429) {
        if (tentativa >= MAXIMO_DE_TENTATIVAS) {
          throw new ErroEnem("limite", "A API do ENEM está limitando as requisições. Aguarde um minuto e tente de novo.");
        }
        const pedida = Number(resposta.headers.get("x-ratelimit-reset"));
        await this.esperar(Math.min(pedida > 0 ? pedida : 10_000, ESPERA_MAXIMA_MS));
        continue;
      }
      if (resposta.status === 404) {
        throw new ErroEnem("nao_encontrado", "A API do ENEM não encontrou o que foi pedido.");
      }
      if (!resposta.ok) {
        throw new ErroEnem("indisponivel", `A API do ENEM respondeu com o erro ${resposta.status}. Tente de novo em instantes.`);
      }
      try {
        return (await resposta.json()) as T;
      } catch {
        throw new ErroEnem("resposta_invalida", "A API do ENEM devolveu uma resposta que não consegui ler.");
      }
    }
  }
}
