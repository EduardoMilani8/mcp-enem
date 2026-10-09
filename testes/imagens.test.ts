import { expect, test } from "vitest";
import { CarregadorDeImagens } from "../src/enem/imagens.js";
import { BYTES_JPEG, BYTES_PNG, pastaTemporaria } from "./apoio.js";

const PNG_EM_BASE64 = Buffer.from(BYTES_PNG).toString("base64");

function buscadorDe(conteudo: number[] | string, status = 200) {
  const chamadas: string[] = [];
  const buscar: typeof fetch = async (entrada) => {
    chamadas.push(String(entrada));
    return new Response(typeof conteudo === "string" ? conteudo : new Uint8Array(conteudo), { status });
  };
  return { buscar, chamadas };
}

test("baixa, devolve em base64 e não baixa de novo", async () => {
  const { buscar, chamadas } = buscadorDe(BYTES_PNG);
  const pasta = await pastaTemporaria();
  const carregador = new CarregadorDeImagens(pasta, { buscar });
  const imagem = await carregador.carregar("https://enem.dev/2023/questions/94/figura.png");
  expect(imagem).toEqual({ dados: PNG_EM_BASE64, mimeType: "image/png" });

  const outraInstancia = new CarregadorDeImagens(pasta, { buscar });
  expect(await outraInstancia.carregar("https://enem.dev/2023/questions/94/figura.png")).toEqual(imagem);
  expect(chamadas).toHaveLength(1);
});

test("aceita a extensão em maiúsculas e o formato jpeg", async () => {
  const png = new CarregadorDeImagens(await pastaTemporaria(), { buscar: buscadorDe(BYTES_PNG).buscar });
  expect((await png.carregar("https://enem.dev/a/FIGURA.PNG"))?.mimeType).toBe("image/png");
  const jpeg = new CarregadorDeImagens(await pastaTemporaria(), { buscar: buscadorDe(BYTES_JPEG).buscar });
  expect((await jpeg.carregar("https://enem.dev/a/foto.jpg"))?.mimeType).toBe("image/jpeg");
});

test("informa o tipo real do conteúdo, mesmo com a extensão trocada", async () => {
  const carregador = new CarregadorDeImagens(await pastaTemporaria(), { buscar: buscadorDe(BYTES_JPEG).buscar });
  expect((await carregador.carregar("https://enem.dev/a/na-verdade-jpeg.png"))?.mimeType).toBe("image/jpeg");
});

test("recusa conteúdo que não é imagem e não o guarda em cache", async () => {
  const pasta = await pastaTemporaria();
  const paginaDeErro = new CarregadorDeImagens(pasta, { buscar: buscadorDe("<html>Erro 502</html>").buscar });
  expect(await paginaDeErro.carregar("https://enem.dev/a/figura.png")).toBeNull();

  const depois = buscadorDe(BYTES_PNG);
  const carregador = new CarregadorDeImagens(pasta, { buscar: depois.buscar });
  expect(await carregador.carregar("https://enem.dev/a/figura.png")).toEqual({ dados: PNG_EM_BASE64, mimeType: "image/png" });
  expect(depois.chamadas).toHaveLength(1);
});

test("devolve null para o que não deve ser baixado", async () => {
  const { buscar, chamadas } = buscadorDe(BYTES_PNG);
  const carregador = new CarregadorDeImagens(await pastaTemporaria(), { buscar });
  expect(await carregador.carregar("https://enem.dev/broken-image.svg")).toBeNull();
  expect(await carregador.carregar("http://enem.dev/sem-https.png")).toBeNull();
  expect(await carregador.carregar("isto não é uma url")).toBeNull();
  expect(chamadas).toEqual([]);
});

test("devolve null quando o download falha, sem lançar erro", async () => {
  const pasta = await pastaTemporaria();
  const erro404 = new CarregadorDeImagens(pasta, { buscar: buscadorDe(BYTES_PNG, 404).buscar });
  expect(await erro404.carregar("https://enem.dev/a.png")).toBeNull();

  const semRede = new CarregadorDeImagens(pasta, {
    buscar: async () => {
      throw new TypeError("fetch failed");
    },
  });
  expect(await semRede.carregar("https://enem.dev/b.png")).toBeNull();
});

test("devolve null para imagem vazia ou grande demais", async () => {
  const pasta = await pastaTemporaria();
  const vazia = new CarregadorDeImagens(pasta, { buscar: buscadorDe([]).buscar });
  expect(await vazia.carregar("https://enem.dev/vazia.png")).toBeNull();
  const grande = new CarregadorDeImagens(pasta, { buscar: buscadorDe(BYTES_PNG).buscar, limiteBytes: BYTES_PNG.length - 1 });
  expect(await grande.carregar("https://enem.dev/grande.png")).toBeNull();
});
