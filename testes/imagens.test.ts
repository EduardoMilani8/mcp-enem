import { expect, test } from "vitest";
import { CarregadorDeImagens } from "../src/enem/imagens.js";
import { pastaTemporaria } from "./apoio.js";

function buscadorDe(bytes: number[], status = 200) {
  const chamadas: string[] = [];
  const buscar: typeof fetch = async (entrada) => {
    chamadas.push(String(entrada));
    return new Response(new Uint8Array(bytes), { status });
  };
  return { buscar, chamadas };
}

test("baixa, devolve em base64 e não baixa de novo", async () => {
  const { buscar, chamadas } = buscadorDe([1, 2, 3]);
  const pasta = await pastaTemporaria();
  const carregador = new CarregadorDeImagens(pasta, { buscar });
  const imagem = await carregador.carregar("https://enem.dev/2023/questions/94/figura.png");
  expect(imagem).toEqual({ dados: "AQID", mimeType: "image/png" });

  const outraInstancia = new CarregadorDeImagens(pasta, { buscar });
  expect(await outraInstancia.carregar("https://enem.dev/2023/questions/94/figura.png")).toEqual(imagem);
  expect(chamadas).toHaveLength(1);
});

test("reconhece a extensão em maiúsculas e o tipo jpeg", async () => {
  const carregador = new CarregadorDeImagens(await pastaTemporaria(), { buscar: buscadorDe([9]).buscar });
  expect((await carregador.carregar("https://enem.dev/a/FIGURA.PNG"))?.mimeType).toBe("image/png");
  expect((await carregador.carregar("https://enem.dev/a/foto.jpg"))?.mimeType).toBe("image/jpeg");
});

test("devolve null para o que não deve ser baixado", async () => {
  const { buscar, chamadas } = buscadorDe([1]);
  const carregador = new CarregadorDeImagens(await pastaTemporaria(), { buscar });
  expect(await carregador.carregar("https://enem.dev/broken-image.svg")).toBeNull();
  expect(await carregador.carregar("http://enem.dev/sem-https.png")).toBeNull();
  expect(await carregador.carregar("isto não é uma url")).toBeNull();
  expect(chamadas).toEqual([]);
});

test("devolve null quando o download falha, sem lançar erro", async () => {
  const pasta = await pastaTemporaria();
  const erro404 = new CarregadorDeImagens(pasta, { buscar: buscadorDe([1], 404).buscar });
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
  const grande = new CarregadorDeImagens(pasta, { buscar: buscadorDe([1, 2, 3, 4]).buscar, limiteBytes: 3 });
  expect(await grande.carregar("https://enem.dev/grande.png")).toBeNull();
});
