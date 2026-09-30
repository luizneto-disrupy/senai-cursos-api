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

    const token = process.env.BROWSERLESS_TOKEN;

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "BROWSERLESS_TOKEN não configurado no Vercel"
      });
    }

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

    const browserlessUrl =
      "https://production-sfo.browserless.io/unblock" +
      "?token=" +
      encodeURIComponent(token) +
      "&proxy=residential" +
      "&proxyCountry=br";

    const resposta = await fetch(browserlessUrl, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        url: url,
        content: true,
        cookies: false,
        screenshot: false,
        browserWSEndpoint: false,
        waitForTimeout: 5000
      })

    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(500).json({
        sucesso: false,
        erro: "Browserless retornou erro",
        status: resposta.status,
        detalhe: dados
      });
    }

    const html = dados.content || "";

    if (!html) {
      return res.status(500).json({
        sucesso: false,
        erro: "HTML não encontrado na resposta do Browserless"
      });
    }

    const $ = cheerio.load(html);


    return res.status(200).json({

      sucesso: true,

      filtros: {

        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidades: [
          "POÇO",
          "DISTRITO INDUSTRIAL"
        ]

      },

      total: cursosFinais.length,

      cursos: cursosFinais

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
