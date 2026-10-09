import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CarregadorDeImagens } from "../enem/imagens.js";
import type { RepositorioEnem } from "../enem/repositorio.js";
import { AREAS, ErroEnem, IDIOMAS, LETRAS, paraPublica, type Questao, type QuestaoPublica } from "../enem/tipos.js";
import { calcularDesempenho, chavesRespondidas, errosPendentes } from "../historico/estatisticas.js";
import type { Historico } from "../historico/historico.js";
import { log } from "../log.js";
import { formatarDesempenho, formatarQuestao } from "./formatar.js";
import { escolherAno, filtrar, sortear } from "./sorteio.js";

// Mensagens de validação do zod em português do Brasil.
z.config(z.locales.ptBR());

export interface Dependencias {
  repositorio: RepositorioEnem;
  historico: Historico;
  imagens: CarregadorDeImagens;
  aleatorio?: () => number;
  agora?: () => Date;
  /** Tempo máximo de espera por todas as imagens de uma resposta. */
  prazoDasImagensMs?: number;
}

/** Quantas imagens, no máximo, o servidor tenta baixar e anexar por resposta. */
export const MAXIMO_DE_IMAGENS_POR_RESPOSTA = 8;

/** Soma máxima das imagens anexadas (em caracteres de base64, cerca de 2,2 MB). */
export const TETO_DE_IMAGENS_EM_BASE64 = 3_000_000;

const PRAZO_PADRAO_DAS_IMAGENS_MS = 12_000;

/** Baixar uma prova leva uns 5 segundos; isto limita a espera de uma busca. */
const MAXIMO_DE_PROVAS_NOVAS_POR_BUSCA = 2;

type Bloco = CallToolResult["content"][number];

const campoAno = z.number().int().min(2009).describe("Ano da prova, por exemplo 2023.");
const campoNumero = z.number().int().min(1).max(200).describe("Número da questão na prova.");
const campoArea = z.enum(AREAS).describe("Área do conhecimento.");
const campoIdioma = z
  .enum(IDIOMAS)
  .describe("Idioma das questões de língua estrangeira. Só afeta essas questões.");

function texto(mensagem: string): CallToolResult {
  return { content: [{ type: "text", text: mensagem }] };
}

function falha(mensagem: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: mensagem }] };
}

async function proteger(
  acao: () => Promise<CallToolResult>,
  dicaSemRede: () => Promise<string>,
): Promise<CallToolResult> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof ErroEnem) {
      const semRede = erro.codigo === "indisponivel" || erro.codigo === "limite";
      return falha(erro.message + (semRede ? await dicaSemRede() : ""));
    }
    log("erro inesperado:", erro);
    return falha("Ocorreu um erro inesperado no mcp-enem. Tente de novo.");
  }
}

function enderecosDasImagens(questao: QuestaoPublica): string[] {
  return [...questao.imagens, ...questao.alternativas.flatMap((a) => (a.imagem ? [a.imagem] : []))];
}

/** Devolve o resultado da promessa, ou null se ela falhar ou passar do prazo. */
function comPrazo<T>(promessa: Promise<T>, prazoMs: number): Promise<T | null> {
  return new Promise((resolver) => {
    const cronometro = setTimeout(() => resolver(null), prazoMs);
    const encerrar = (valor: T | null) => {
      clearTimeout(cronometro);
      resolver(valor);
    };
    promessa.then(encerrar, () => encerrar(null));
  });
}

async function montarQuestoes(
  questoes: QuestaoPublica[],
  imagens: CarregadorDeImagens,
  avisos: string[],
  prazoDasImagensMs: number,
): Promise<CallToolResult> {
  // Só as primeiras imagens são baixadas, todas ao mesmo tempo e com um prazo
  // único: uma imagem lenta ou um servidor fora do ar não seguram as questões.
  const tentadas = questoes.flatMap(enderecosDasImagens).slice(0, MAXIMO_DE_IMAGENS_POR_RESPOSTA);
  const carregadas = await Promise.all(
    tentadas.map((endereco) => comPrazo(imagens.carregar(endereco), prazoDasImagensMs)),
  );

  const blocos: Bloco[] = [];
  let posicao = 0;
  let tamanhoAnexado = 0;
  let semAnexo = 0;
  for (const questao of questoes) {
    blocos.push({ type: "text", text: formatarQuestao(questao) });
    for (let i = 0; i < enderecosDasImagens(questao).length; i++) {
      const imagem = carregadas[posicao++] ?? null;
      if (imagem && tamanhoAnexado + imagem.dados.length <= TETO_DE_IMAGENS_EM_BASE64) {
        blocos.push({ type: "image", data: imagem.dados, mimeType: imagem.mimeType });
        tamanhoAnexado += imagem.dados.length;
      } else {
        semAnexo++;
      }
    }
  }
  const todos = [...avisos];
  if (semAnexo > 0) todos.push(`${semAnexo} imagem(ns) não foram anexadas; use os links no texto da questão.`);
  if (todos.length > 0) blocos.push({ type: "text", text: `Avisos:\n${todos.map((a) => `- ${a}`).join("\n")}` });
  return { content: blocos };
}

export function registrarFerramentas(servidor: McpServer, dependencias: Dependencias): void {
  const { repositorio, historico, imagens } = dependencias;
  const aleatorio = dependencias.aleatorio ?? Math.random;
  const agora = dependencias.agora ?? (() => new Date());
  const prazoDasImagensMs = dependencias.prazoDasImagensMs ?? PRAZO_PADRAO_DAS_IMAGENS_MS;

  // Sem rede, dizer o que ainda funciona ajuda mais do que só relatar a falha.
  const protegido = (acao: () => Promise<CallToolResult>) =>
    proteger(acao, async () => {
      const baixadas = await repositorio.anosEmCache();
      return baixadas.length > 0 ? ` Provas já baixadas, que funcionam sem internet: ${baixadas.join(", ")}.` : "";
    });

  servidor.registerTool(
    "listar_provas",
    { description: "Lista os anos de prova do ENEM disponíveis, as áreas do conhecimento e os idiomas." },
    async () =>
      protegido(async () => {
        const provas = await repositorio.listarProvas();
        const anos = provas.map((p) => p.ano);
        return texto(
          [
            `Provas disponíveis: ${anos.join(", ")}.`,
            `Áreas (parâmetro "area"): ${AREAS.join(", ")}.`,
            `Idiomas das questões de língua estrangeira (parâmetro "idioma"): ${IDIOMAS.join(", ")}.`,
          ].join("\n"),
        );
      }),
  );

  servidor.registerTool(
    "buscar_questoes",
    {
      description:
        "Sorteia questões oficiais do ENEM para o aluno responder. A resposta certa NÃO é devolvida: " +
        "depois que o aluno responder, use corrigir_resposta. Apresente uma questão por vez.",
      inputSchema: {
        quantidade: z.number().int().min(1).max(20).default(5).describe("Quantas questões sortear (1 a 20)."),
        area: campoArea.optional(),
        ano: campoAno.optional().describe("Ano da prova. Se omitido, um ano é sorteado."),
        idioma: campoIdioma.default("ingles"),
        apenas_texto: z.boolean().default(false).describe("Se verdadeiro, pula questões que têm imagem."),
        ineditas: z.boolean().default(true).describe("Se verdadeiro, evita questões que o aluno já respondeu."),
      },
    },
    async ({ quantidade, area, ano, idioma, apenas_texto, ineditas }) =>
      protegido(async () => {
        const avisos: string[] = [];
        const excluir = ineditas ? chavesRespondidas(await historico.ler()) : new Set<string>();

        const filtro = { area, idioma, apenasTexto: apenas_texto, excluir };

        if (ano !== undefined) {
          const candidatas = filtrar(await repositorio.questoesDoAno(ano), filtro);
          const escolhidas = sortear(candidatas, quantidade, aleatorio).sort((a, b) => a.numero - b.numero);
          if (escolhidas.length === 0) {
            return texto(
              `Não há questões do ENEM ${ano} com esses filtros. ` +
                "Tente outro ano ou outra área, ou use ineditas=false para repetir questões já respondidas.",
            );
          }
          if (escolhidas.length < quantidade) {
            avisos.push(`Só havia ${escolhidas.length} de ${quantidade} questões com esses filtros no ENEM ${ano}.`);
          }
          return montarQuestoes(escolhidas.map(paraPublica), imagens, avisos, prazoDasImagensMs);
        }

        // Sem ano: começa por uma prova e, se ela não tiver questões suficientes,
        // completa com as outras (primeiro as já baixadas, depois as novas).
        const disponiveis = await repositorio.anosDisponiveis();
        const emCache = await repositorio.anosEmCache();
        const primeiro = escolherAno(disponiveis, emCache, aleatorio);
        const outros = disponiveis.filter((a) => a !== primeiro);
        const fila = [
          primeiro,
          ...sortear(outros.filter((a) => emCache.includes(a)), outros.length, aleatorio),
          ...sortear(outros.filter((a) => !emCache.includes(a)), outros.length, aleatorio),
        ];

        const escolhidas: Questao[] = [];
        const consultados: number[] = [];
        let provasNovas = 0;
        let falhaDeRede: ErroEnem | null = null;
        for (const anoDaVez of fila) {
          if (escolhidas.length >= quantidade) break;
          const nova = !emCache.includes(anoDaVez);
          // Cada prova nova custa um download; e sem rede não adianta tentar outra.
          if (nova && (falhaDeRede !== null || provasNovas >= MAXIMO_DE_PROVAS_NOVAS_POR_BUSCA)) continue;
          let questoes: Questao[];
          try {
            questoes = await repositorio.questoesDoAno(anoDaVez);
          } catch (erro) {
            if (!(erro instanceof ErroEnem) || erro.codigo === "nao_encontrado") throw erro;
            falhaDeRede = erro;
            continue;
          }
          if (nova) provasNovas++;
          consultados.push(anoDaVez);
          escolhidas.push(...sortear(filtrar(questoes, filtro), quantidade - escolhidas.length, aleatorio));
        }

        if (consultados.length === 0 && falhaDeRede) throw falhaDeRede;
        if (falhaDeRede) avisos.push("Não consegui baixar uma prova nova; usei as que já estavam guardadas.");
        const provas = [...consultados].sort((a, b) => a - b).join(", ");
        if (escolhidas.length === 0) {
          return texto(
            `Não há questões com esses filtros nas provas consultadas (${provas}). ` +
              "Tente outra área, informe um ano específico, ou use ineditas=false para repetir questões já respondidas.",
          );
        }
        if (escolhidas.length < quantidade) {
          avisos.push(
            `Só havia ${escolhidas.length} de ${quantidade} questões com esses filtros nas provas consultadas (${provas}).`,
          );
        }
        escolhidas.sort((a, b) => a.ano - b.ano || a.numero - b.numero);
        return montarQuestoes(escolhidas.map(paraPublica), imagens, avisos, prazoDasImagensMs);
      }),
  );

  servidor.registerTool(
    "obter_questao",
    {
      description:
        "Devolve uma questão específica do ENEM pelo ano e número, sem a resposta certa. " +
        "Use corrigir_resposta depois que o aluno responder.",
      inputSchema: { ano: campoAno, numero: campoNumero, idioma: campoIdioma.optional() },
    },
    async ({ ano, numero, idioma }) =>
      protegido(async () => {
        const questao = await repositorio.obterQuestao(ano, numero, idioma);
        return montarQuestoes([paraPublica(questao)], imagens, [], prazoDasImagensMs);
      }),
  );

  servidor.registerTool(
    "corrigir_resposta",
    {
      description:
        "Confere a resposta do aluno com o gabarito oficial, revela a alternativa correta e registra a " +
        "tentativa no histórico. Chame só depois que o aluno tiver escolhido uma alternativa.",
      inputSchema: {
        ano: campoAno,
        numero: campoNumero,
        resposta: z
          .enum(["A", "B", "C", "D", "E", "a", "b", "c", "d", "e"])
          .describe("A alternativa que o aluno escolheu, de A a E."),
        idioma: campoIdioma
          .optional()
          .describe(
            "Obrigatório nas questões de língua estrangeira: o idioma da questão que o aluno respondeu " +
              '(aparece na linha "Língua estrangeira" da questão).',
          ),
      },
    },
    async ({ ano, numero, resposta, idioma }) =>
      protegido(async () => {
        // A mesma questão em inglês e em espanhol tem gabaritos diferentes:
        // sem saber o idioma, corrigir seria um chute.
        const idiomasDaQuestao = (await repositorio.questoesDoAno(ano))
          .filter((q) => q.numero === numero)
          .flatMap((q) => (q.idioma ? [q.idioma] : []));
        if (idioma === undefined && idiomasDaQuestao.length > 1) {
          return falha(
            `A questão ${numero} do ENEM ${ano} existe em mais de um idioma (${idiomasDaQuestao.join(", ")}). ` +
              'Informe no parâmetro "idioma" qual deles o aluno respondeu.',
          );
        }
        const questao = await repositorio.obterQuestao(ano, numero, idioma);
        const marcada = LETRAS.find((letra) => letra === resposta.toUpperCase());
        if (!marcada) return falha("A resposta deve ser uma letra de A a E.");
        const acertou = marcada === questao.gabarito;
        await historico.registrar({
          quando: agora().toISOString(),
          ano: questao.ano,
          numero: questao.numero,
          idioma: questao.idioma,
          area: questao.area,
          resposta: marcada,
          correta: questao.gabarito,
          acertou,
        });
        const correta = questao.alternativas.find((a) => a.letra === questao.gabarito);
        const gabarito = `${questao.gabarito}) ${correta?.texto ?? "(alternativa em imagem)"}`;
        const qual = questao.idioma ? ` (questão ${questao.numero}, em ${questao.idioma})` : "";
        return texto(
          acertou
            ? `Resposta correta${qual}. Gabarito oficial: ${gabarito}`
            : `Resposta incorreta${qual}. O aluno marcou ${marcada}. Gabarito oficial: ${gabarito}`,
        );
      }),
  );

  servidor.registerTool(
    "ver_desempenho",
    {
      description: "Mostra os acertos e erros do aluno, no geral, nos últimos 7 dias e por área do conhecimento.",
      inputSchema: {
        area: campoArea.optional(),
        dias: z.number().int().min(1).max(3650).optional().describe("Considera só os últimos N dias."),
      },
    },
    async ({ area, dias }) =>
      protegido(async () => {
        const tentativas = await historico.ler();
        if (tentativas.length === 0) {
          return texto("O aluno ainda não respondeu nenhuma questão. Use buscar_questoes para começar.");
        }
        return texto(formatarDesempenho(calcularDesempenho(tentativas, { area, dias, agora: agora() })));
      }),
  );

  servidor.registerTool(
    "revisar_erros",
    {
      description:
        "Devolve questões que o aluno errou e ainda precisa rever, sem a resposta certa, para ele tentar de novo. " +
        "Use corrigir_resposta depois que ele responder.",
      inputSchema: {
        quantidade: z.number().int().min(1).max(20).default(5).describe("Quantas questões devolver (1 a 20)."),
        area: campoArea.optional(),
      },
    },
    async ({ quantidade, area }) =>
      protegido(async () => {
        const pendentes = errosPendentes(await historico.ler()).filter((t) => area === undefined || t.area === area);
        const questoes: QuestaoPublica[] = [];
        for (const pendente of pendentes.slice(0, quantidade)) {
          try {
            const questao = await repositorio.obterQuestao(pendente.ano, pendente.numero, pendente.idioma ?? undefined);
            questoes.push(paraPublica(questao));
          } catch (erro) {
            if (!(erro instanceof ErroEnem)) throw erro;
            log(`não consegui recarregar a questão ${pendente.numero} de ${pendente.ano}: ${erro.message}`);
          }
        }
        if (questoes.length === 0) return texto("Nenhum erro pendente para rever.");
        return montarQuestoes(questoes, imagens, [], prazoDasImagensMs);
      }),
  );
}
