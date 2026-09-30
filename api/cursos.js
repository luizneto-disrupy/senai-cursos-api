const cheerio = require("cheerio");

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido"
    });
  }

  try {

    const params = new URLSearchParams();

    params.append(
      "modality[]",
      "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO"
    );

    params.append(
      "unit[]",
      "POÇO"
    );

    params.append(
      "unit[]",
      "DISTRITO INDUSTRIAL"
    );

    const url =
      "https://al.senai.br/cursos/?" +
      params.toString();

    /*
     * Usamos o Reader da Jina para fazer a consulta.
     * Isso evita o bloqueio 403 que ocorreu diretamente
     * entre o Vercel e o SENAI.
     */

    const readerUrl =
      "https://r.jina.ai/" + url;

    const resposta = await fetch(readerUrl, {
      headers: {
        "Accept": "text/plain",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!resposta.ok) {
      throw new Error(
        `Jina retornou status ${resposta.status}`
      );
    }

    const conteudo = await resposta.text();

    /*
     * A resposta da Jina é conteúdo convertido.
     * Criamos uma estrutura HTML temporária para
     * facilitar a extração.
     */

    const $ = cheerio.load(
      `<div id="conteudo">${conteudo}</div>`
    );

    const texto =
      $("#conteudo")
        .text()
        .replace(/\s+/g, " ")
        .trim();

    /*
     * Aqui começamos por retornar o conteúdo bruto.
     * Isso é proposital.
     *
     * Primeiro vamos confirmar que a Jina conseguiu
     * acessar corretamente a página filtrada.
     */

    return res.status(200).json({

      sucesso: true,

      fonte: url,

      filtros: {
        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidades: [
          "POÇO",
          "DISTRITO INDUSTRIAL"
        ]
      },

      tamanho: texto.length,

      conteudo: texto

    });

  } catch (erro) {

    console.error(erro);

    return res.status(500).json({

      sucesso: false,

      erro:
        "Não foi possível consultar os cursos do SENAI.",

      detalhe:
        erro.message

    });

  }

};
