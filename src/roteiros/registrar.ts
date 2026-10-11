import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AREAS, NOMES_DAS_AREAS } from "../enem/tipos.js";

// Um roteiro (no protocolo MCP, um "prompt") é um pedido pronto que o aluno
// escolhe num menu do cliente. Ele não executa nada: só entrega ao modelo o
// texto de como conduzir aquela sessão de estudo com as ferramentas.

const MAXIMO_DE_QUESTOES = 20;
const QUESTOES_DO_SIMULADO = 10;

function pedido(linhas: string[]) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: linhas.join("\n") } }] };
}

const COMO_CORRIGIR =
  "informando sempre a materia e o assunto, e também o idioma nas questões de língua estrangeira";

export function registrarRoteiros(servidor: McpServer): void {
  servidor.registerPrompt(
    "simulado_rapido",
    {
      title: "Simulado rápido",
      description: "Um simulado curto com questões reais do ENEM, corrigido só no final, com resumo dos erros.",
      argsSchema: {
        quantidade: z
          .string()
          .regex(/^\d{1,3}$/, "Informe um número.")
          .optional()
          .describe(`Quantas questões (de 1 a ${MAXIMO_DE_QUESTOES}). Padrão: ${QUESTOES_DO_SIMULADO}.`),
        area: z.enum(AREAS).optional().describe("Área do conhecimento. Se omitida, mistura todas."),
      },
    },
    ({ quantidade, area }) => {
      const total = Math.min(Math.max(Number(quantidade ?? QUESTOES_DO_SIMULADO), 1), MAXIMO_DE_QUESTOES);
      const daArea = area ? ` de ${NOMES_DAS_AREAS[area]}` : "";
      const filtro = area ? `, area="${area}"` : "";
      return pedido([
        `Quero fazer um simulado rápido do ENEM com ${total} questões${daArea}.`,
        "",
        "Conduza assim:",
        `1. Chame buscar_questoes com quantidade=${total}${filtro}.`,
        "2. Mostre uma questão por vez, na ordem, e espere a minha resposta antes de mostrar a próxima.",
        "3. Durante o simulado não corrija nem comente: só anote a alternativa que eu marcar.",
        `4. Quando eu responder a última, chame corrigir_resposta para cada questão, ${COMO_CORRIGIR}.`,
        "5. Mostre o resultado: quantas acertei e, para cada erro, uma explicação curta da resolução.",
        "6. Termine dizendo o que vale estudar a partir dos erros.",
      ]);
    },
  );

  servidor.registerPrompt(
    "revisao_dos_erros",
    {
      title: "Revisão dos erros",
      description: "Refaz, uma por uma, as questões que você errou, com explicação quando errar de novo.",
    },
    () =>
      pedido([
        "Quero rever as questões do ENEM que eu errei.",
        "",
        "Conduza assim:",
        "1. Chame revisar_erros. Se não houver erros pendentes, me avise e sugira um simulado.",
        "2. Mostre uma questão por vez, sem dizer qual alternativa eu tinha marcado antes, e espere a minha resposta.",
        `3. Chame corrigir_resposta com o que eu responder, ${COMO_CORRIGIR}.`,
        "4. Se eu acertar, confirme em uma linha e siga para a próxima.",
        "5. Se eu errar de novo, explique a resolução passo a passo antes de seguir.",
        "6. No fim, chame ver_desempenho e diga em que matérias e assuntos eu ainda preciso insistir.",
      ]),
  );

  servidor.registerPrompt(
    "estudar_assunto",
    {
      title: "Estudar um assunto",
      description: "Um resumo do assunto e questões reais do ENEM sobre ele, uma de cada vez.",
      argsSchema: {
        assunto: z.string().trim().min(2).max(60).describe('O assunto, por exemplo "logaritmos" ou "Era Vargas".'),
      },
    },
    ({ assunto }) =>
      pedido([
        `Quero estudar "${assunto}" para o ENEM.`,
        "",
        "Conduza assim:",
        "1. Em poucas linhas, diga o que costuma cair sobre esse assunto e o que eu preciso saber para resolver.",
        "2. Chame buscar_questoes com quantidade=5 e palavras_chave contendo o assunto e variações que aparecem em",
        "   enunciados (sinônimos, termos técnicos, abreviações). A busca é por palavra no texto, não por tema.",
        "3. Se vierem poucas questões, chame de novo com os mesmos parâmetros: cada chamada procura em mais provas.",
        "4. Descarte as que não forem de fato sobre o assunto e mostre as outras uma por vez, esperando a resposta.",
        `5. A cada resposta, chame corrigir_resposta ${COMO_CORRIGIR}. Use sempre "${assunto}" como assunto.`,
        "6. Explique cada erro e, no fim, resuma como eu fui e o que revisar.",
      ]),
  );

  servidor.registerPrompt(
    "como_estou",
    {
      title: "Como estou indo",
      description: "Lê o seu histórico e monta um diagnóstico com um plano de estudo para a semana.",
    },
    () =>
      pedido([
        "Quero saber como estou indo nos estudos para o ENEM.",
        "",
        "Conduza assim:",
        "1. Chame ver_desempenho.",
        "2. Se eu tiver respondido poucas questões (menos de 20), diga que ainda é cedo para concluir e sugira um simulado.",
        "3. Caso contrário, aponte minhas duas matérias mais fortes, as duas mais fracas e os assuntos em que mais erro.",
        "4. Monte um plano simples para a próxima semana, com o que praticar em cada dia.",
        "5. Ofereça começar agora pela revisão dos erros (revisar_erros) ou por questões do assunto mais fraco",
        "   (buscar_questoes com palavras_chave).",
      ]),
  );
}
